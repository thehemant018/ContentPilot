import {
  allocateDynamicPlaceholderId,
  buildNestedChildPlaceholderKey,
  parseRenderingParameters,
  readDynamicPlaceholderIdFromParameters,
} from "@/lib/sitecore/dynamic-placeholder";
import {
  resolveNestedPlaceholderFormat,
  resolveNestedPlaceholderFormatForPair,
} from "@/lib/sitecore/nested-placeholder-format";
import type { NestedPlaceholderFormat, RenderingPlaceholderProfile } from "@/types/discovery";

const LOG_PREFIX = "[MigrateX:rendering-params]";

function logRenderingParams(
  message: string,
  data?: Record<string, unknown>,
): void {
  if (data) {
    console.log(LOG_PREFIX, message, data);
  } else {
    console.log(LOG_PREFIX, message);
  }
}

export const DYNAMIC_PLACEHOLDER_ID_PARAM = "DynamicPlaceholderId";

/** SXA / headless base template inherited by rendering parameter templates. */
export const IDYNAMIC_PLACEHOLDER_BASE_TEMPLATE_NAME = "IDynamicPlaceholder";

export const DYNAMIC_PLACEHOLDER_ID_FIELD_NAMES = [
  "DynamicPlaceholderId",
  "Dynamic Placeholder Id",
  "dynamicPlaceholderId",
];

/** SXA Experience Accelerator flag on rendering items (Other properties field). */
export const SXA_DYNAMIC_PLACEHOLDER_RENDERING_PROPERTY =
  "IsRenderingsWithDynamicPlaceholders";

export const OTHER_PROPERTIES_FIELD_NAMES = [
  "Other properties",
  "Other Properties",
  "OtherProperties",
];

/** Sitecore layout XML stores & as &amp; inside s:par attribute values. */
export function escapeLayoutParameterAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function buildSitecoreRenderingParametersString(
  parameters: Record<string, string | number | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined || value === "") {
      continue;
    }
    parts.push(`${key}=${String(value)}`);
  }
  if (parts.length === 0) {
    return "";
  }
  const result = escapeLayoutParameterAttribute(`&${parts.join("&")}`);
  logRenderingParams("buildSitecoreRenderingParametersString", {
    input: parameters,
    output: result,
  });
  return result;
}

export function mergeRenderingParameterStrings(
  existing: string | undefined,
  additions: Record<string, string | number>,
): string {
  const merged = {
    ...parseRenderingParameters(existing),
    ...Object.fromEntries(
      Object.entries(additions).map(([key, value]) => [key, String(value)]),
    ),
  };
  const result = buildSitecoreRenderingParametersString(merged);
  logRenderingParams("mergeRenderingParameterStrings", {
    existing: existing ?? "",
    additions,
    merged,
    output: result,
  });
  return result;
}

export function fieldsIncludeDynamicPlaceholderConfiguration(
  fields: Array<{ name: string; value?: string }>,
): boolean {
  return fields.some((field) =>
    DYNAMIC_PLACEHOLDER_ID_FIELD_NAMES.some(
      (name) => field.name.toLowerCase() === name.toLowerCase(),
    ),
  );
}

function isTruthySitecoreValue(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

/** Parses SXA "Other properties" name/value pairs from a rendering item field. */
export function parseSitecoreOtherProperties(
  raw: string | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw?.trim()) {
    return result;
  }

  const decoded = raw.replace(/&amp;/g, "&").trim();

  for (const match of decoded.matchAll(
    /name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi,
  )) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key) {
      result[key] = value ?? "";
    }
  }

  const segments = decoded.split(/[\r\n;]+/);

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    const pairs = trimmed.includes("&")
      ? trimmed.split("&")
      : [trimmed];

    for (const pair of pairs) {
      const part = pair.trim();
      if (!part) {
        continue;
      }
      const separator = part.indexOf("=");
      if (separator === -1) {
        continue;
      }
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * SXA marks renderings that use dynamic placeholders via Other properties:
 * IsRenderingsWithDynamicPlaceholders=true
 *
 * @see https://doc.sitecore.com/xp/en/developers/104/sitecore-experience-manager/dynamic-placeholders.html
 */
export function renderingHasSxaDynamicPlaceholdersEnabled(
  fields: Array<{ name: string; value?: string }>,
): boolean {
  for (const field of fields) {
    if (
      field.name.toLowerCase() ===
      SXA_DYNAMIC_PLACEHOLDER_RENDERING_PROPERTY.toLowerCase()
    ) {
      return isTruthySitecoreValue(field.value);
    }
  }

  for (const fieldName of OTHER_PROPERTIES_FIELD_NAMES) {
    const field = fields.find(
      (entry) => entry.name.toLowerCase() === fieldName.toLowerCase(),
    );
    if (!field?.value?.trim()) {
      continue;
    }

    const props = parseSitecoreOtherProperties(field.value);
    for (const [key, value] of Object.entries(props)) {
      if (
        key.toLowerCase() ===
          SXA_DYNAMIC_PLACEHOLDER_RENDERING_PROPERTY.toLowerCase() &&
        isTruthySitecoreValue(value)
      ) {
        return true;
      }
    }

    const inline = field.value.toLowerCase();
    if (
      inline.includes(
        `${SXA_DYNAMIC_PLACEHOLDER_RENDERING_PROPERTY.toLowerCase()}=true`,
      )
    ) {
      return true;
    }
  }

  return false;
}

export function resolveRenderingDynamicPlaceholderSupport(input: {
  renderingFields: Array<{ name: string; value?: string }>;
  parametersTemplatePath?: string;
  parameterFields: Array<{ name: string; value?: string }>;
  baseTemplateNames: string[];
}): {
  usesSxaDynamicPlaceholders: boolean;
  inheritsIDynamicPlaceholder: boolean;
  parametersTemplateConfigured: boolean;
  hasDynamicPlaceholders: boolean;
} {
  const usesSxaDynamicPlaceholders = renderingHasSxaDynamicPlaceholdersEnabled(
    input.renderingFields,
  );
  const inheritsIDynamicPlaceholder = templateInheritsIDynamicPlaceholder(
    input.baseTemplateNames,
  );
  const parametersTemplateConfigured = Boolean(input.parametersTemplatePath);
  const parametersTemplateReady = parameterTemplateSupportsDynamicPlaceholders({
    parameterFields: input.parameterFields,
    baseTemplateNames: input.baseTemplateNames,
  });

  // SXA requires both: rendering flag + parameter template with IDynamicPlaceholder.
  const hasDynamicPlaceholders =
    usesSxaDynamicPlaceholders &&
    parametersTemplateConfigured &&
    parametersTemplateReady;

  return {
    usesSxaDynamicPlaceholders,
    inheritsIDynamicPlaceholder,
    parametersTemplateConfigured,
    hasDynamicPlaceholders,
  };
}

export function collectBaseTemplateNames(
  templates:
    | Array<{
        name: string;
        baseTemplates?: Array<{ name: string; baseTemplates?: unknown }>;
      }>
    | undefined,
): string[] {
  const names: string[] = [];

  for (const template of templates ?? []) {
    names.push(template.name);
    if (template.baseTemplates?.length) {
      names.push(
        ...collectBaseTemplateNames(
          template.baseTemplates as Array<{
            name: string;
            baseTemplates?: Array<{ name: string; baseTemplates?: unknown }>;
          }>,
        ),
      );
    }
  }

  return names;
}

export function templateInheritsIDynamicPlaceholder(
  baseTemplateNames: string[],
): boolean {
  const target = IDYNAMIC_PLACEHOLDER_BASE_TEMPLATE_NAME.toLowerCase();
  return baseTemplateNames.some((name) => {
    const normalized = name.trim().toLowerCase();
    return (
      normalized === target ||
      normalized.endsWith(`/${target}`) ||
      normalized.split("/").pop() === target
    );
  });
}

export function parameterTemplateSupportsDynamicPlaceholders(input: {
  parameterFields: Array<{ name: string; value?: string }>;
  baseTemplateNames: string[];
}): boolean {
  return (
    templateInheritsIDynamicPlaceholder(input.baseTemplateNames) ||
    fieldsIncludeDynamicPlaceholderConfiguration(input.parameterFields)
  );
}

export function renderingProfileHasDynamicPlaceholders(
  profile: RenderingPlaceholderProfile | undefined,
): boolean {
  return profile?.hasDynamicPlaceholders === true;
}

export function renderingRequiresDynamicPlaceholderId(
  profile: RenderingPlaceholderProfile | undefined,
  hasQueuedChildren: boolean,
): boolean {
  if (hasQueuedChildren) {
    logRenderingParams("renderingRequiresDynamicPlaceholderId", {
      renderingPath: profile?.renderingPath,
      renderingName: profile?.renderingName,
      hasDynamicPlaceholders: profile?.hasDynamicPlaceholders,
      defaultDynamicPlaceholderId: profile?.defaultDynamicPlaceholderId,
      hasQueuedChildren,
      required: true,
      reason: "has queued children — parent needs DynamicPlaceholderId in s:par",
    });
    return true;
  }

  const required = renderingProfileHasDynamicPlaceholders(profile);

  logRenderingParams("renderingRequiresDynamicPlaceholderId", {
    renderingPath: profile?.renderingPath,
    renderingName: profile?.renderingName,
    hasDynamicPlaceholders: profile?.hasDynamicPlaceholders,
    defaultDynamicPlaceholderId: profile?.defaultDynamicPlaceholderId,
    hasQueuedChildren,
    required,
    reason: required
      ? profile?.usesSxaDynamicPlaceholders
        ? "SXA IsRenderingsWithDynamicPlaceholders + IDynamicPlaceholder parameter template"
        : "parameters template defines DynamicPlaceholderId"
      : "rendering missing SXA dynamic placeholder flag and/or IDynamicPlaceholder on parameter template",
  });

  return required;
}

/**
 * When discovery marks a rendering as dynamic-placeholder capable, allocate an id
 * and build s:par parameters for the parent rendering on the page layout.
 */
export function assignDynamicPlaceholderPresentation(input: {
  profile: RenderingPlaceholderProfile | undefined;
  hasQueuedChildren: boolean;
  layoutXml: string;
  parentResolvedPlaceholder: string;
  nestedPlaceholderKeyPattern: string;
  preferredId?: number;
}): {
  apply: boolean;
  dynamicPlaceholderId?: number;
  parameters: Record<string, string | number>;
} {
  const apply = renderingRequiresDynamicPlaceholderId(
    input.profile,
    input.hasQueuedChildren,
  );

  if (!apply) {
    return { apply: false, parameters: {} };
  }

  const pattern = input.nestedPlaceholderKeyPattern.trim();
  if (!pattern) {
    return { apply: false, parameters: {} };
  }

  const dynamicPlaceholderId = allocateDynamicPlaceholderId(
    input.layoutXml,
    input.parentResolvedPlaceholder,
    pattern,
    input.preferredId ??
      input.profile?.defaultDynamicPlaceholderId ??
      1,
  );

  const parameters = {
    [DYNAMIC_PLACEHOLDER_ID_PARAM]: dynamicPlaceholderId,
  };

  logRenderingParams("assignDynamicPlaceholderPresentation", {
    renderingPath: input.profile?.renderingPath,
    nestedPlaceholderKeyPattern: pattern,
    parentResolvedPlaceholder: input.parentResolvedPlaceholder,
    dynamicPlaceholderId,
    parameters,
  });

  return {
    apply: true,
    dynamicPlaceholderId,
    parameters,
  };
}

/**
 * Builds the nested s:ph value for a child under a dynamic-placeholder parent,
 * e.g. /headless-main/CardList-2
 */
export function resolveNestedDynamicPresentationPlaceholder(input: {
  parentProfile: RenderingPlaceholderProfile | undefined;
  childProfile: RenderingPlaceholderProfile | undefined;
  parentResolvedPlaceholder: string;
  parentRenderingName: string;
  parentRenderingUid: string;
  parentDynamicPlaceholderId: number;
  childPlaceholderKey: string;
  nestedPlaceholderFormat?: NestedPlaceholderFormat;
}): string {
  const format = resolveNestedPlaceholderFormatForPair({
    nestedPlaceholderFormat: input.nestedPlaceholderFormat,
    parentProfile: input.parentProfile,
    childProfile: input.childProfile,
  });

  const nestedPlaceholder = buildNestedChildPlaceholderKey({
    format,
    parentResolvedPlaceholder: input.parentResolvedPlaceholder,
    parentRenderingName: input.parentRenderingName,
    parentRenderingUid: input.parentRenderingUid,
    childPlaceholderKey: input.childPlaceholderKey,
    dynamicPlaceholderId: input.parentDynamicPlaceholderId,
  });

  logRenderingParams("resolveNestedDynamicPresentationPlaceholder", {
    parentRenderingName: input.parentRenderingName,
    parentDynamicPlaceholderId: input.parentDynamicPlaceholderId,
    childPlaceholderKey: input.childPlaceholderKey,
    nestedPlaceholder,
    format,
  });

  return nestedPlaceholder;
}

export function readDynamicPlaceholderIdFromLayoutParameters(
  parameters: string | undefined,
): number | undefined {
  return readDynamicPlaceholderIdFromParameters(parameters);
}

const RENDERING_TAG_REGEX = /<r\s([^>]+?)\s*\/>/gi;
const ATTRIBUTE_REGEX = /([\w:]+)="([^"]*)"/g;

function parseRenderingAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of attrString.matchAll(ATTRIBUTE_REGEX)) {
    attrs[match[1]!] = match[2] ?? "";
  }
  return attrs;
}

function formatUidToken(uid: string): string {
  const hex = uid.replace(/[{}]/g, "").trim();
  if (hex.length === 32 && /^[0-9A-Fa-f]+$/.test(hex)) {
    const upper = hex.toUpperCase();
    return `{${upper.slice(0, 8)}-${upper.slice(8, 12)}-${upper.slice(12, 16)}-${upper.slice(16, 20)}-${upper.slice(20)}}`;
  }
  return uid.startsWith("{") ? uid : `{${hex}}`;
}

/**
 * Merges parameters into an existing layout rendering matched by uid.
 */
export function mergeLayoutRenderingParametersByUid(
  layoutXml: string,
  uid: string,
  parameters: Record<string, string | number>,
): string {
  const uidToken = formatUidToken(uid);
  let updated = layoutXml;
  let matched = false;

  for (const match of layoutXml.matchAll(RENDERING_TAG_REGEX)) {
    const fullElement = match[0]!;
    const attrs = parseRenderingAttributes(match[1] ?? "");
    const elementUid = attrs.uid?.trim();
    if (!elementUid || formatUidToken(elementUid) !== uidToken) {
      continue;
    }

    matched = true;
    const mergedPar = mergeRenderingParameterStrings(attrs["s:par"], parameters);
    const rebuilt = /s:par="/i.test(fullElement)
      ? fullElement.replace(/s:par="[^"]*"/i, `s:par="${mergedPar}"`)
      : fullElement.replace(
          /\s*\/>$/,
          ` s:par="${mergedPar}" s:ccb="Clear on publish" />`,
        );
    logRenderingParams("mergeLayoutRenderingParametersByUid", {
      uid: uidToken,
      placeholder: attrs["s:ph"],
      previousPar: attrs["s:par"] ?? "",
      parameters,
      mergedPar,
      hadParAttribute: /s:par="/i.test(fullElement),
    });
    updated = updated.replace(fullElement, rebuilt);
    break;
  }

  if (!matched) {
    logRenderingParams("mergeLayoutRenderingParametersByUid: no match", {
      uid: uidToken,
      parameters,
    });
  }

  return updated;
}
