import type {
  DiscoveryItem,
  DiscoveryResult,
  PathValidationResult,
  PlaceholderDefinition,
  RenderingPlaceholderProfile,
  TemplateDefinition,
} from "@/types/discovery";

/** Legacy discovery payloads may still include these fields. */
export type LegacyDiscoveryResult = DiscoveryResult & {
  media?: DiscoveryItem[];
  allPathsValid?: boolean;
};

export function isDatasourceTemplate(template: TemplateDefinition): boolean {
  return (
    template.fields.length > 0 && !/\bparameters?\b/i.test(template.name)
  );
}

function slimRendering(item: DiscoveryItem): DiscoveryItem {
  return {
    itemId: item.itemId,
    name: item.name,
    path: item.path,
  };
}

function slimPathValidation(item: PathValidationResult): PathValidationResult {
  return {
    path: item.path,
    label: item.label,
    exists: item.exists,
  };
}

function slimPlaceholder(item: PlaceholderDefinition): PlaceholderDefinition {
  return {
    itemId: item.itemId,
    name: item.name,
    path: item.path,
    key: item.key,
  };
}

function slimRenderingProfile(
  profile: RenderingPlaceholderProfile,
): RenderingPlaceholderProfile {
  return {
    renderingPath: profile.renderingPath,
    renderingId: profile.renderingId,
    renderingName: profile.renderingName,
    allowedParentPlaceholderKeys: profile.allowedParentPlaceholderKeys,
    exposedChildPlaceholderKeys: profile.exposedChildPlaceholderKeys,
    defaultDynamicPlaceholderId: profile.defaultDynamicPlaceholderId,
    hasDynamicPlaceholders: profile.hasDynamicPlaceholders,
    usesSxaDynamicPlaceholders: profile.usesSxaDynamicPlaceholders,
    inheritsIDynamicPlaceholder: profile.inheritsIDynamicPlaceholder,
    nestedPlaceholderFormat: profile.nestedPlaceholderFormat,
  };
}

/** Keeps only data required for AI match, export, and migrate push. */
export function slimDiscoveryResult(result: DiscoveryResult): DiscoveryResult {
  if (!result.success) {
    return {
      success: false,
      message: result.message,
      pathValidation: result.pathValidation?.map(slimPathValidation),
    };
  }

  return {
    success: true,
    message: result.message,
    mediaPath: result.mediaPath,
    pageTemplatePath: result.pageTemplatePath,
    sxaPageDataTemplatePath: result.sxaPageDataTemplatePath,
    placeholdersPath: result.placeholdersPath,
    renderings: (result.renderings ?? []).map(slimRendering),
    placeholders: (result.placeholders ?? []).map(slimPlaceholder),
    renderingProfiles: (result.renderingProfiles ?? []).map(slimRenderingProfile),
    templates: (result.templates ?? [])
      .filter(isDatasourceTemplate)
      .map((template) => ({
        itemId: template.itemId,
        name: template.name,
        path: template.path,
        fields: template.fields.map((field) => ({
          name: field.name,
          type: field.type,
          section: field.section,
        })),
      })),
  };
}
