import {
  ITEM_FIELDS_BY_ID_QUERY,
  ITEM_FIELDS_QUERY,
  ITEM_INHERITED_FIELDS_QUERY,
  ITEM_PATH_BY_ID_QUERY,
  SEARCH_ITEM_BY_ID_QUERY,
  SEARCH_UNDER_PATH_QUERY,
  TEMPLATE_INHERITANCE_QUERY,
  TEMPLATE_STRUCTURE_QUERY,
} from "@/lib/sitecore/discovery/queries";
import { executeGraphQL } from "@/lib/sitecore/graphql-client";
import { formatSitecoreGuid } from "@/lib/sitecore/layout-xml";
import { resolveNestedPlaceholderFormat } from "@/lib/sitecore/nested-placeholder-format";
import {
  DYNAMIC_PLACEHOLDER_ID_PARAM,
  collectBaseTemplateNames,
  fieldsIncludeDynamicPlaceholderConfiguration,
  resolveRenderingDynamicPlaceholderSupport,
  templateInheritsIDynamicPlaceholder,
} from "@/lib/sitecore/rendering-parameters";
import type {
  DiscoveryItem,
  PlaceholderDefinition,
  RenderingPlaceholderProfile,
} from "@/types/discovery";

const SEARCH_PAGE_SIZE = 500;

const PLACEHOLDER_TEMPLATE_PATTERN = /placeholder/i;

const PLACEHOLDER_KEY_FIELD_NAMES = [
  "Placeholder Key",
  "placeholder key",
  "Key",
  "key",
];

const ALLOWED_PLACEHOLDER_FIELD_NAMES = new Set([
  "Editable",
  "Allowed Placeholders",
  "Allowed Controls",
]);

const EXPOSED_PLACEHOLDER_FIELD_NAMES = new Set([
  "Placeholders",
  "Placeholder Settings",
  "Layout Service Placeholders",
]);

const DYNAMIC_PLACEHOLDER_ID_FIELD_NAMES = [
  "DynamicPlaceholderId",
  "Dynamic Placeholder Id",
  "dynamicPlaceholderId",
];

const PARAMETERS_FIELD_NAMES = [
  "Parameters Template",
  "Parameters template",
  "Parameters",
  "parameters",
  "Parameter Template",
];

const BASE_TEMPLATE_FIELD_NAMES = [
  "__Base template",
  "Base template",
  "__Base Template",
];

interface SearchResult {
  search: {
    results: Array<{
      innerItem: {
        itemId: string;
        name: string;
        path: string;
        template?: { name: string };
      };
    }>;
  };
}

interface ItemFieldsResult {
  item: {
    itemId: string;
    name: string;
    path: string;
    fields?: {
      nodes?: Array<{ name: string; value?: string }>;
    };
  } | null;
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

interface TemplateInheritanceResult {
  templates?: Array<{
    name: string;
    baseTemplates?: Array<{
      name: string;
      baseTemplates?: Array<{
        name: string;
        baseTemplates?: Array<{
          name: string;
          baseTemplates?: Array<{ name: string }>;
        }>;
      }>;
    }>;
    ownFields?: Array<{ name: string }>;
  }>;
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`;
  }
  return trimmed.replace(/\/+$/, "") || trimmed;
}

function normalizeGuid(value: string): string {
  return value.replace(/[{}]/g, "").trim().toUpperCase();
}

function parseMultilistValue(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function readPlaceholderKey(
  fields: Array<{ name: string; value?: string }>,
): string {
  for (const fieldName of PLACEHOLDER_KEY_FIELD_NAMES) {
    const field = fields.find(
      (entry) => entry.name.toLowerCase() === fieldName.toLowerCase(),
    );
    const key = field?.value?.trim();
    if (key) {
      return key;
    }
  }

  return "";
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
    }));
}

interface ItemPathResult {
  item: {
    itemId: string;
    path: string;
  } | null;
}

function isSitecoreItemIdReference(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("/sitecore/")) {
    return false;
  }
  return /^[{]?[0-9A-Fa-f-]{32,36}[}]?$/.test(trimmed);
}

interface SearchItemByIdResult {
  search: {
    results: Array<{
      innerItem: {
        itemId: string;
        path: string;
      };
    }>;
  };
}

function sitecoreItemIdLookupTokens(reference: string): string[] {
  const hex = reference.replace(/[{}-]/g, "").trim();
  if (!hex) {
    return [];
  }

  const upper = hex.toUpperCase();
  const braced = formatSitecoreGuid(reference);
  const dashed =
    hex.length === 32
      ? `${upper.slice(0, 8)}-${upper.slice(8, 12)}-${upper.slice(12, 16)}-${upper.slice(16, 20)}-${upper.slice(20)}`
      : upper;

  return [...new Set([braced, dashed, upper, hex])];
}

function sitecoreSearchIndexIdTokens(reference: string): string[] {
  const hex = reference.replace(/[{}-]/g, "").trim().toLowerCase();
  if (!hex) {
    return [];
  }

  const upper = hex.toUpperCase();
  const dashed =
    hex.length === 32
      ? `${upper.slice(0, 8)}-${upper.slice(8, 12)}-${upper.slice(12, 16)}-${upper.slice(16, 20)}-${upper.slice(20)}`.toLowerCase()
      : hex;

  return [...new Set([hex, dashed, upper, formatSitecoreGuid(reference).replace(/[{}]/g, "").toLowerCase()])];
}

function mergeItemFieldSets(
  ...fieldSets: Array<Array<{ name: string; value?: string }>>
): Array<{ name: string; value?: string }> {
  const merged = new Map<string, { name: string; value?: string }>();

  for (const fields of fieldSets) {
    for (const field of fields) {
      const key = field.name.toLowerCase();
      const existing = merged.get(key);
      if (!existing?.value?.trim() && field.value?.trim()) {
        merged.set(key, field);
      } else if (!existing) {
        merged.set(key, field);
      }
    }
  }

  return Array.from(merged.values());
}

async function resolveItemPathFromId(
  instanceUrl: string,
  accessToken: string,
  itemReference: string,
): Promise<string | undefined> {
  for (const itemId of sitecoreItemIdLookupTokens(itemReference)) {
    try {
      const byId = await executeGraphQL<ItemFieldsResult>(
        instanceUrl,
        accessToken,
        ITEM_FIELDS_BY_ID_QUERY,
        { itemId },
      );
      if (byId.item?.path) {
        return byId.item.path;
      }

      const pathOnly = await executeGraphQL<ItemPathResult>(
        instanceUrl,
        accessToken,
        ITEM_PATH_BY_ID_QUERY,
        { itemId },
      );
      if (pathOnly.item?.path) {
        return pathOnly.item.path;
      }
    } catch {
    }
  }

  for (const searchId of sitecoreSearchIndexIdTokens(itemReference)) {
    try {
      const searchResult = await executeGraphQL<SearchItemByIdResult>(
        instanceUrl,
        accessToken,
        SEARCH_ITEM_BY_ID_QUERY,
        { itemId: searchId, pageSize: 1 },
      );
      const path = searchResult.search?.results?.[0]?.innerItem?.path?.trim();
      if (path) {
        return path;
      }
    } catch {
    }
  }

  return undefined;
}

async function resolveParametersTemplatePath(
  instanceUrl: string,
  accessToken: string,
  parametersValue: string,
): Promise<string | undefined> {
  if (parametersValue.startsWith("/sitecore/")) {
    return parametersValue;
  }

  if (isSitecoreItemIdReference(parametersValue)) {
    return resolveItemPathFromId(instanceUrl, accessToken, parametersValue);
  }

  return undefined;
}

async function fetchItemFields(
  instanceUrl: string,
  accessToken: string,
  path: string,
): Promise<Array<{ name: string; value?: string }>> {
  const data = await executeGraphQL<ItemFieldsResult>(
    instanceUrl,
    accessToken,
    ITEM_FIELDS_QUERY,
    { path },
  );

  return data.item?.fields?.nodes ?? [];
}

async function fetchRenderingFieldsForDiscovery(
  instanceUrl: string,
  accessToken: string,
  path: string,
): Promise<Array<{ name: string; value?: string }>> {
  const ownFields = await fetchItemFields(instanceUrl, accessToken, path);
  let inheritedFields: Array<{ name: string; value?: string }> = [];

  try {
    const data = await executeGraphQL<ItemFieldsResult>(
      instanceUrl,
      accessToken,
      ITEM_INHERITED_FIELDS_QUERY,
      { path },
    );
    inheritedFields = data.item?.fields?.nodes ?? [];
  } catch {
  }

  return mergeItemFieldSets(inheritedFields, ownFields);
}

function resolveMultilistToKeys(
  multilistValue: string | undefined,
  placeholderById: Map<string, PlaceholderDefinition>,
): string[] {
  const keys = new Set<string>();

  for (const rawId of parseMultilistValue(multilistValue)) {
    const trimmed = rawId.trim();
    if (!trimmed) {
      continue;
    }

    if (!isSitecoreItemIdReference(trimmed) && !trimmed.startsWith("/sitecore/")) {
      keys.add(trimmed.replace(/^\/+/, ""));
      continue;
    }

    const normalizedId = normalizeGuid(trimmed);
    const placeholder =
      placeholderById.get(normalizedId) ??
      [...placeholderById.values()].find(
        (entry) => normalizeGuid(entry.itemId) === normalizedId,
      );

    if (placeholder?.key) {
      keys.add(placeholder.key);
    }
  }

  return Array.from(keys);
}

function findRenderingByReference(
  reference: string,
  renderingById: Map<string, DiscoveryItem>,
): DiscoveryItem | undefined {
  const trimmed = reference.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("/sitecore/")) {
    const normalizedPath = normalizePath(trimmed);
    return [...renderingById.values()].find(
      (rendering) => normalizePath(rendering.path) === normalizedPath,
    );
  }

  const normalizedId = normalizeGuid(trimmed);
  return (
    renderingById.get(normalizedId) ??
    [...renderingById.values()].find(
      (rendering) => normalizeGuid(rendering.itemId) === normalizedId,
    )
  );
}

async function resolveMultilistToRenderings(
  instanceUrl: string,
  accessToken: string,
  multilistValue: string | undefined,
  renderingById: Map<string, DiscoveryItem>,
): Promise<DiscoveryItem[]> {
  const renderings: DiscoveryItem[] = [];
  const seen = new Set<string>();

  for (const reference of parseMultilistValue(multilistValue)) {
    const trimmed = reference.trim();
    if (!trimmed) {
      continue;
    }

    let rendering = findRenderingByReference(trimmed, renderingById);
    if (!rendering && isSitecoreItemIdReference(trimmed)) {
      const path = await resolveItemPathFromId(instanceUrl, accessToken, trimmed);
      if (path) {
        rendering = findRenderingByReference(path, renderingById);
        if (!rendering) {
          const name = path.split("/").filter(Boolean).pop() ?? path;
          rendering = {
            itemId: normalizeGuid(trimmed),
            name,
            path,
          };
        }
      }
    }

    if (!rendering) {
      continue;
    }

    const dedupeKey = normalizePath(rendering.path);
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    renderings.push(rendering);
  }

  return renderings;
}

/**
 * Reads Placeholder Setting Allowed Controls and resolves them to rendering paths/names.
 */
export async function enrichPlaceholderDefinitionsWithAllowedControls(
  instanceUrl: string,
  accessToken: string,
  placeholders: PlaceholderDefinition[],
  renderings: DiscoveryItem[],
): Promise<PlaceholderDefinition[]> {
  const renderingById = new Map<string, DiscoveryItem>();
  for (const rendering of renderings) {
    renderingById.set(normalizeGuid(rendering.itemId), rendering);
  }

  const enriched: PlaceholderDefinition[] = [];

  for (const placeholder of placeholders) {
    let allowedRenderingPaths = placeholder.allowedRenderingPaths ?? [];
    let allowedRenderingNames = placeholder.allowedRenderingNames ?? [];

    if (
      allowedRenderingPaths.length === 0 &&
      allowedRenderingNames.length === 0
    ) {
      try {
        const fields = await fetchItemFields(
          instanceUrl,
          accessToken,
          placeholder.path,
        );
        const allowedControlsValue = readFieldValue(
          fields,
          ["Allowed Controls"],
        );
        const allowedRenderings = await resolveMultilistToRenderings(
          instanceUrl,
          accessToken,
          allowedControlsValue,
          renderingById,
        );
        allowedRenderingPaths = allowedRenderings.map(
          (rendering) => rendering.path,
        );
        allowedRenderingNames = allowedRenderings.map(
          (rendering) => rendering.name,
        );
      } catch {
      }
    }

    enriched.push({
      ...placeholder,
      allowedRenderingPaths,
      allowedRenderingNames,
    });
  }

  return enriched;
}

async function resolveMultilistToKeysWithLookup(
  instanceUrl: string,
  accessToken: string,
  multilistValue: string | undefined,
  placeholderById: Map<string, PlaceholderDefinition>,
): Promise<string[]> {
  const keys = new Set(resolveMultilistToKeys(multilistValue, placeholderById));

  for (const rawId of parseMultilistValue(multilistValue)) {
    const trimmed = rawId.trim();
    if (!trimmed) {
      continue;
    }

    if (!isSitecoreItemIdReference(trimmed) && !trimmed.startsWith("/sitecore/")) {
      continue;
    }

    const normalizedId = normalizeGuid(trimmed);
    const alreadyResolved = [...keys].some((key) =>
      placeholderById.get(normalizedId)?.key === key,
    );
    if (
      alreadyResolved ||
      placeholderById.has(normalizedId) ||
      [...placeholderById.values()].some(
        (entry) => normalizeGuid(entry.itemId) === normalizedId,
      )
    ) {
      continue;
    }

    try {
      const path = trimmed.startsWith("/sitecore/")
        ? trimmed
        : await resolveItemPathFromId(instanceUrl, accessToken, trimmed);
      if (!path) {
        continue;
      }

      const fields = await fetchItemFields(instanceUrl, accessToken, path);
      const key = readPlaceholderKey(fields);
      if (key) {
        keys.add(key);
      }
    } catch {
    }
  }

  return Array.from(keys);
}

function readFieldValue(
  fields: Array<{ name: string; value?: string }>,
  names: string[],
): string {
  for (const fieldName of names) {
    const field = fields.find(
      (entry) => entry.name.toLowerCase() === fieldName.toLowerCase(),
    );
    const value = field?.value?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function readDefaultDynamicPlaceholderId(
  fields: Array<{ name: string; value?: string }>,
): number | undefined {
  const raw = readFieldValue(fields, DYNAMIC_PLACEHOLDER_ID_FIELD_NAMES);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function templateInheritancePathsToTry(templatePath: string): string[] {
  const paths = [templatePath];
  if (templatePath.endsWith("/Rendering Parameters")) {
    paths.push(templatePath.replace(/\/Rendering Parameters$/, ""));
  }
  return [...new Set(paths)];
}

async function fetchTemplateInheritance(
  instanceUrl: string,
  accessToken: string,
  parametersTemplatePath: string,
): Promise<{
  baseTemplateNames: string[];
  inheritsIDynamicPlaceholder: boolean;
  ownFieldNames: string[];
  resolvedTemplatePath: string;
}> {
  for (const templatePath of templateInheritancePathsToTry(
    parametersTemplatePath,
  )) {
    try {
      const inheritance = await executeGraphQL<TemplateInheritanceResult>(
        instanceUrl,
        accessToken,
        TEMPLATE_INHERITANCE_QUERY,
        { path: templatePath },
      );

      const templateDefinition = inheritance.templates?.[0];
      const baseTemplateNames = collectBaseTemplateNames(
        templateDefinition?.baseTemplates,
      );
      const inheritsIDynamicPlaceholder =
        templateInheritsIDynamicPlaceholder(baseTemplateNames);

      if (templateDefinition) {
        return {
          baseTemplateNames,
          inheritsIDynamicPlaceholder,
          ownFieldNames:
            templateDefinition.ownFields?.map((field) => field.name) ?? [],
          resolvedTemplatePath: templatePath,
        };
      }
    } catch {
    }
  }

  return {
    baseTemplateNames: [],
    inheritsIDynamicPlaceholder: false,
    ownFieldNames: [],
    resolvedTemplatePath: parametersTemplatePath,
  };
}

async function resolveBaseTemplateNamesFromFields(
  instanceUrl: string,
  accessToken: string,
  fields: Array<{ name: string; value?: string }>,
): Promise<string[]> {
  const raw = readFieldValue(fields, BASE_TEMPLATE_FIELD_NAMES);
  if (!raw) {
    return [];
  }

  const names = new Set<string>();

  for (const reference of parseMultilistValue(raw)) {
    if (reference.startsWith("/sitecore/")) {
      names.add(reference);
      const segment = reference.split("/").filter(Boolean).pop();
      if (segment) {
        names.add(segment);
      }
      continue;
    }

    const path = await resolveItemPathFromId(instanceUrl, accessToken, reference);
    if (!path) {
      continue;
    }

    names.add(path);
    const segment = path.split("/").filter(Boolean).pop();
    if (segment) {
      names.add(segment);
    }
  }

  return Array.from(names);
}

async function fetchParameterTemplateFieldDefinitions(
  instanceUrl: string,
  accessToken: string,
  renderingFields: Array<{ name: string; value?: string }>,
): Promise<{
  parametersTemplatePath?: string;
  fields: Array<{ name: string; value?: string }>;
  baseTemplateNames: string[];
  inheritsIDynamicPlaceholder: boolean;
}> {
  const rawParametersValue = readFieldValue(renderingFields, PARAMETERS_FIELD_NAMES);
  const parametersValue = rawParametersValue.split("|")[0]?.trim() ?? "";

  if (!parametersValue) {
    return {
      fields: [],
      baseTemplateNames: [],
      inheritsIDynamicPlaceholder: false,
    };
  }

  let parametersTemplatePath: string | undefined;

  try {
    parametersTemplatePath = await resolveParametersTemplatePath(
      instanceUrl,
      accessToken,
      parametersValue,
    );
  } catch {
  }

  if (!parametersTemplatePath) {
    return {
      fields: [],
      baseTemplateNames: [],
      inheritsIDynamicPlaceholder: false,
    };
  }

  const fields = new Map<string, { name: string; value?: string }>();
  let baseTemplateNames: string[] = [];
  let inheritsIDynamicPlaceholder = false;

  try {
    const inheritance = await fetchTemplateInheritance(
      instanceUrl,
      accessToken,
      parametersTemplatePath,
    );
    baseTemplateNames = inheritance.baseTemplateNames;
    inheritsIDynamicPlaceholder = inheritance.inheritsIDynamicPlaceholder;

    for (const ownFieldName of inheritance.ownFieldNames) {
      fields.set(ownFieldName.toLowerCase(), { name: ownFieldName });
    }
  } catch {
  }

  try {
    const structure = await executeGraphQL<TemplateStructureResult>(
      instanceUrl,
      accessToken,
      TEMPLATE_STRUCTURE_QUERY,
      { path: parametersTemplatePath },
    );

    for (const field of extractFieldsFromParameterTemplateStructure(structure)) {
      fields.set(field.name.toLowerCase(), field);
    }
  } catch {
  }

  // Always read template item fields
  try {
    const templateItemFields = await fetchItemFields(
      instanceUrl,
      accessToken,
      parametersTemplatePath,
    );
    for (const field of templateItemFields) {
      fields.set(field.name.toLowerCase(), field);
    }

    const resolvedBaseNames = await resolveBaseTemplateNamesFromFields(
      instanceUrl,
      accessToken,
      templateItemFields,
    );
    if (resolvedBaseNames.length > 0) {
      baseTemplateNames = [...new Set([...baseTemplateNames, ...resolvedBaseNames])];
      inheritsIDynamicPlaceholder =
        templateInheritsIDynamicPlaceholder(baseTemplateNames);
    }
  } catch {
  }

  const mergedFieldsFinal = Array.from(fields.values());

  if (
    inheritsIDynamicPlaceholder &&
    !fieldsIncludeDynamicPlaceholderConfiguration(mergedFieldsFinal)
  ) {
    mergedFieldsFinal.push({ name: DYNAMIC_PLACEHOLDER_ID_PARAM });
  }

  return {
    parametersTemplatePath,
    fields: mergedFieldsFinal,
    baseTemplateNames,
    inheritsIDynamicPlaceholder,
  };
}

function extractFieldsFromParameterTemplateStructure(
  data: TemplateStructureResult,
): Array<{ name: string; value?: string }> {
  const fields: Array<{ name: string; value?: string }> = [];
  const sections = data.item?.children?.nodes ?? [];

  for (const section of sections) {
    if (section.template?.name !== "Template section") {
      continue;
    }

    for (const fieldItem of section.children?.nodes ?? []) {
      if (fieldItem.template?.name !== "Template field") {
        continue;
      }

      const fieldNodes = fieldItem.fields?.nodes ?? [];
      const defaultValue = fieldNodes.find(
        (node) =>
          node.name === "Default value" ||
          node.name === "__Standard value" ||
          node.name === "Default Value",
      )?.value;

      fields.push({
        name: fieldItem.name,
        value: defaultValue,
      });
    }
  }

  return fields;
}

interface RenderingParametersInfo {
  defaultDynamicPlaceholderId: number;
  hasDynamicPlaceholders: boolean;
  usesSxaDynamicPlaceholders: boolean;
  inheritsIDynamicPlaceholder: boolean;
}

async function readRenderingParametersInfo(
  instanceUrl: string,
  accessToken: string,
  renderingFields: Array<{ name: string; value?: string }>,
  renderingPath: string,
  renderingName: string,
): Promise<RenderingParametersInfo> {
  const parametersTemplate = await fetchParameterTemplateFieldDefinitions(
    instanceUrl,
    accessToken,
    renderingFields,
  );
  const parameterFields = parametersTemplate.fields;

  const support = resolveRenderingDynamicPlaceholderSupport({
    renderingFields,
    parametersTemplatePath: parametersTemplate.parametersTemplatePath,
    parameterFields,
    baseTemplateNames: parametersTemplate.baseTemplateNames,
  });

  const defaultDynamicPlaceholderId =
    readDefaultDynamicPlaceholderId(renderingFields) ??
    readDefaultDynamicPlaceholderId(parameterFields) ??
    1;

  return {
    defaultDynamicPlaceholderId,
    hasDynamicPlaceholders: support.hasDynamicPlaceholders,
    usesSxaDynamicPlaceholders: support.usesSxaDynamicPlaceholders,
    inheritsIDynamicPlaceholder: support.inheritsIDynamicPlaceholder,
  };
}

export async function fetchPlaceholderDefinitions(
  instanceUrl: string,
  accessToken: string,
  placeholdersPath: string,
): Promise<PlaceholderDefinition[]> {
  const items = await searchItemsUnderPath(
    instanceUrl,
    accessToken,
    placeholdersPath,
  );

  const placeholderItems = items.filter((item) =>
    PLACEHOLDER_TEMPLATE_PATTERN.test(item.templateName ?? ""),
  );

  const definitions: PlaceholderDefinition[] = [];

  for (const item of placeholderItems) {
    const fields = await fetchItemFields(instanceUrl, accessToken, item.path);
    const key = readPlaceholderKey(fields);
    if (!key) {
      continue;
    }

    definitions.push({
      itemId: item.itemId,
      name: item.name,
      path: item.path,
      key,
    });
  }

  return definitions.sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

export async function fetchRenderingPlaceholderProfiles(
  instanceUrl: string,
  accessToken: string,
  renderings: DiscoveryItem[],
  placeholders: PlaceholderDefinition[],
): Promise<RenderingPlaceholderProfile[]> {
  const placeholderById = new Map<string, PlaceholderDefinition>();
  for (const placeholder of placeholders) {
    placeholderById.set(normalizeGuid(placeholder.itemId), placeholder);
  }

  const profiles: RenderingPlaceholderProfile[] = [];

  for (const rendering of renderings) {
    const fields = await fetchRenderingFieldsForDiscovery(
      instanceUrl,
      accessToken,
      rendering.path,
    );

    const allowedKeys = new Set<string>();
    const exposedKeys = new Set<string>();

    for (const field of fields) {
      if (ALLOWED_PLACEHOLDER_FIELD_NAMES.has(field.name)) {
        for (const key of await resolveMultilistToKeysWithLookup(
          instanceUrl,
          accessToken,
          field.value,
          placeholderById,
        )) {
          allowedKeys.add(key);
        }
      }

      if (EXPOSED_PLACEHOLDER_FIELD_NAMES.has(field.name)) {
        for (const key of await resolveMultilistToKeysWithLookup(
          instanceUrl,
          accessToken,
          field.value,
          placeholderById,
        )) {
          exposedKeys.add(key);
        }
      }
    }

  // Heuristic: placeholders whose key contains the rendering name slug may be exposed.
    if (exposedKeys.size === 0) {
      const renderingSlug = rendering.name
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, "-")
        .toLowerCase();

      for (const placeholder of placeholders) {
        const keySlug = placeholder.key.toLowerCase();
        if (
          keySlug.includes(renderingSlug) &&
          !keySlug.endsWith("-main") &&
          keySlug !== renderingSlug
        ) {
          exposedKeys.add(placeholder.key);
        }
      }
    }

    const allowed = Array.from(allowedKeys).sort();
    const exposed = Array.from(exposedKeys).sort();

    let parametersInfo: RenderingParametersInfo = {
      defaultDynamicPlaceholderId: 1,
      hasDynamicPlaceholders: false,
      usesSxaDynamicPlaceholders: false,
      inheritsIDynamicPlaceholder: false,
    };

    try {
      parametersInfo = await readRenderingParametersInfo(
        instanceUrl,
        accessToken,
        fields,
        rendering.path,
        rendering.name,
      );
    } catch {
    }

    profiles.push({
      renderingPath: rendering.path,
      renderingId: rendering.itemId,
      renderingName: rendering.name,
      allowedParentPlaceholderKeys: allowed,
      exposedChildPlaceholderKeys: exposed,
      defaultDynamicPlaceholderId: parametersInfo.defaultDynamicPlaceholderId,
      hasDynamicPlaceholders: parametersInfo.hasDynamicPlaceholders,
      usesSxaDynamicPlaceholders: parametersInfo.usesSxaDynamicPlaceholders,
      inheritsIDynamicPlaceholder: parametersInfo.inheritsIDynamicPlaceholder,
      nestedPlaceholderFormat: resolveNestedPlaceholderFormat({
        usesSxaDynamicPlaceholders: parametersInfo.usesSxaDynamicPlaceholders,
        hasDynamicPlaceholders: parametersInfo.hasDynamicPlaceholders,
        allowedParentPlaceholderKeys: allowed,
        exposedChildPlaceholderKeys: exposed,
      }),
    });
  }

  return profiles;
}
