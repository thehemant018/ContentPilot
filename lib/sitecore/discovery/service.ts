import {
  GET_SITES_QUERY,
  SEARCH_UNDER_PATH_QUERY,
  TEMPLATE_STRUCTURE_QUERY,
  VALIDATE_PATH_QUERY,
} from "@/lib/sitecore/discovery/queries";
import {
  fetchPlaceholderDefinitions,
  fetchRenderingPlaceholderProfiles,
} from "@/lib/sitecore/discovery/placeholders";
import { slimDiscoveryResult } from "@/lib/sitecore/discovery/slim-result";
import { executeGraphQL } from "@/lib/sitecore/graphql-client";
import {
  fetchInstanceLanguages,
  fetchSiteLanguages,
} from "@/lib/sitecore/languages";
import type {
  DiscoveryItem,
  DiscoveryPathsInput,
  DiscoveryResult,
  PathValidationResult,
  SitecoreSite,
  TemplateDefinition,
  TemplateFieldDefinition,
} from "@/types/discovery";

const SEARCH_PAGE_SIZE = 500;

const RENDERING_TEMPLATE_NAMES = new Set([
  "Json Rendering",
  "Controller Rendering",
  "View Rendering",
  "Xsl Rendering",
  "Rendering",
]);

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`;
  }
  return trimmed.replace(/\/+$/, "") || trimmed;
}

interface SitesQueryResult {
  sites: Array<{
    name: string;
    rootPath: string;
    domain?: string;
    startPath?: string;
    rootItem?: { itemId: string; path?: string };
  }>;
}

interface ValidatePathResult {
  item: {
    itemId: string;
    name: string;
    path: string;
    hasChildren: boolean;
    template?: { name: string; templateId?: string };
  } | null;
}

interface SearchResult {
  search: {
    totalCount: number;
    results: Array<{
      innerItem: {
        itemId: string;
        name: string;
        path: string;
        template?: { name: string; templateId?: string };
      };
    }>;
  };
}

interface TemplateStructureResult {
  item: {
    itemId: string;
    name: string;
    path: string;
    children?: {
      nodes?: Array<{
        name: string;
        template?: { name: string };
        children?: {
          nodes?: Array<{
            name: string;
            template?: { name: string };
            fields?: {
              nodes?: Array<{ name: string; value?: string }>;
            };
          }>;
        };
      }>;
    };
  } | null;
}

export async function fetchSites(
  instanceUrl: string,
  accessToken: string,
): Promise<SitecoreSite[]> {
  const data = await executeGraphQL<SitesQueryResult>(
    instanceUrl,
    accessToken,
    GET_SITES_QUERY,
  );

  return (data.sites ?? []).map((site) => ({
    name: site.name,
    rootPath: site.rootPath,
    domain: site.domain,
    startPath: site.startPath,
    rootItemId: site.rootItem?.itemId,
  }));
}

export async function validatePath(
  instanceUrl: string,
  accessToken: string,
  path: string,
  label: string,
): Promise<PathValidationResult> {
  const normalizedPath = normalizePath(path);

  const data = await executeGraphQL<ValidatePathResult>(
    instanceUrl,
    accessToken,
    VALIDATE_PATH_QUERY,
    { path: normalizedPath },
  );

  if (!data.item?.itemId) {
    return { path: normalizedPath, label, exists: false };
  }

  return {
    path: normalizedPath,
    label,
    exists: true,
    itemId: data.item.itemId,
    name: data.item.name,
    templateName: data.item.template?.name,
  };
}

async function searchItemsUnderPath(
  instanceUrl: string,
  accessToken: string,
  path: string,
): Promise<DiscoveryItem[]> {
  const normalizedPath = normalizePath(path);
  const data = await executeGraphQL<SearchResult>(
    instanceUrl,
    accessToken,
    SEARCH_UNDER_PATH_QUERY,
    { path: normalizedPath, pageSize: SEARCH_PAGE_SIZE, pageIndex: 0 },
  );

  return (data.search?.results ?? [])
    .map((result) => result.innerItem)
    .filter((item) => item.path !== normalizedPath)
    .map((item) => ({
      itemId: item.itemId,
      name: item.name,
      path: item.path,
      templateName: item.template?.name ?? "Unknown",
      templateId: item.template?.templateId,
    }));
}

function extractTemplateFields(
  data: TemplateStructureResult,
): TemplateFieldDefinition[] {
  const fields: TemplateFieldDefinition[] = [];
  const sections = data.item?.children?.nodes ?? [];

  for (const section of sections) {
    if (section.template?.name !== "Template section") {
      continue;
    }

    const sectionFields = section.children?.nodes ?? [];
    for (const fieldItem of sectionFields) {
      if (fieldItem.template?.name !== "Template field") {
        continue;
      }

      const fieldNodes = fieldItem.fields?.nodes ?? [];
      const typeNode = fieldNodes.find((node) => node.name === "Type");

      fields.push({
        name: fieldItem.name,
        type: typeNode?.value ?? "Unknown",
        section: section.name,
      });
    }
  }

  return fields;
}

async function fetchTemplateDefinitions(
  instanceUrl: string,
  accessToken: string,
  templatesPath: string,
): Promise<TemplateDefinition[]> {
  const items = await searchItemsUnderPath(
    instanceUrl,
    accessToken,
    templatesPath,
  );
  const templateItems = items.filter(
    (item) =>
      item.templateName === "Template" &&
      !/\bparameters?\b/i.test(item.name),
  );

  const definitions: TemplateDefinition[] = [];

  for (const templateItem of templateItems) {
    const structure = await executeGraphQL<TemplateStructureResult>(
      instanceUrl,
      accessToken,
      TEMPLATE_STRUCTURE_QUERY,
      { path: templateItem.path },
    );

    definitions.push({
      itemId: templateItem.itemId,
      name: templateItem.name,
      path: templateItem.path,
      fields: extractTemplateFields(structure),
    });
  }

  return definitions.sort((a, b) => a.name.localeCompare(b.name));
}

export async function runDiscovery(
  instanceUrl: string,
  accessToken: string,
  input: DiscoveryPathsInput,
): Promise<DiscoveryResult> {
  const renderingsPath = normalizePath(input.renderingsPath);
  const placeholdersPath = normalizePath(input.placeholdersPath);
  const mediaPath = normalizePath(input.mediaPath);
  const templatesPath = normalizePath(input.templatesPath);

  const pathValidation = await Promise.all([
    validatePath(instanceUrl, accessToken, renderingsPath, "Renderings"),
    validatePath(instanceUrl, accessToken, placeholdersPath, "Placeholders"),
    validatePath(instanceUrl, accessToken, mediaPath, "Media"),
    validatePath(instanceUrl, accessToken, templatesPath, "Templates"),
  ]);

  const allPathsValid = pathValidation.every((result) => result.exists);

  if (!allPathsValid) {
    const missing = pathValidation
      .filter((result) => !result.exists)
      .map((result) => result.label)
      .join(", ");

    return slimDiscoveryResult({
      success: false,
      message: `One or more paths were not found: ${missing}.`,
      pathValidation,
    });
  }

  const [renderingItems, placeholders, templates, instanceLanguages] =
    await Promise.all([
    searchItemsUnderPath(instanceUrl, accessToken, renderingsPath),
    fetchPlaceholderDefinitions(instanceUrl, accessToken, placeholdersPath),
    fetchTemplateDefinitions(instanceUrl, accessToken, templatesPath),
    fetchInstanceLanguages(instanceUrl, accessToken),
  ]);

  const siteRootPath = input.siteRootPath?.trim();
  let siteLanguages = instanceLanguages;

  if (siteRootPath) {
    try {
      siteLanguages = await fetchSiteLanguages(
        instanceUrl,
        accessToken,
        siteRootPath,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch site languages.";
      console.error("[MigrateX:discovery] Site language fetch failed:", message);
      siteLanguages = instanceLanguages;
    }
  }

  const renderings = renderingItems.filter(
    (item) =>
      item.templateName !== undefined &&
      RENDERING_TEMPLATE_NAMES.has(item.templateName),
  );

  const renderingProfiles = await fetchRenderingPlaceholderProfiles(
    instanceUrl,
    accessToken,
    renderings,
    placeholders,
  );

  return slimDiscoveryResult({
    success: true,
    message: `Discovery complete for site "${input.siteName}". All paths verified (read-only).`,
    mediaPath,
    placeholdersPath,
    renderings,
    placeholders,
    renderingProfiles,
    templates,
    instanceLanguages,
    siteLanguages,
    selectedSiteName: input.siteName,
    selectedSiteRootPath: siteRootPath,
  });
}
