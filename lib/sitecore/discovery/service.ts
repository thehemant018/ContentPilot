import { executeGraphQL, SitecoreGraphQLError } from "@/lib/sitecore/graphql-client";
import {
  GET_SITES_QUERY,
  LIST_MEDIA_CHILDREN_QUERY,
  SEARCH_MEDIA_QUERY,
  SEARCH_UNDER_PATH_QUERY,
  TEMPLATE_STRUCTURE_QUERY,
  VALIDATE_PATH_QUERY,
} from "@/lib/sitecore/discovery/queries";
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

const MEDIA_TEMPLATE_NAMES = new Set([
  "Image",
  "File",
  "Jpeg",
  "Jpg",
  "Png",
  "Gif",
  "Pdf",
  "Media folder",
  "Folder",
  "Unversioned Image",
  "Unversioned File",
]);

const MEDIA_TEMPLATE_NAME_LIST = [...MEDIA_TEMPLATE_NAMES];

function formatSearchRootItemId(itemId: string): string {
  const trimmed = itemId.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }
  return `{${trimmed.toUpperCase()}}`;
}

function normalizeSearchItemId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }
  return `{${trimmed.toUpperCase()}}`;
}

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

interface MediaSearchResult {
  search: {
    pageInfo?: {
      endCursor?: string | null;
      hasNext?: boolean;
    };
    results: Array<{
      id: string;
      name: string;
      path?: string | null;
    }>;
  };
}

interface MediaChildrenResult {
  item: {
    children?: {
      nodes?: Array<{
        itemId: string;
        name: string;
        path: string;
        hasChildren: boolean;
        template?: { name: string; templateId?: string };
      }>;
    };
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

async function fetchMediaItems(
  instanceUrl: string,
  accessToken: string,
  mediaPath: string,
  rootItemId: string,
): Promise<DiscoveryItem[]> {
  try {
    return await searchMediaWithWhereClause(
      instanceUrl,
      accessToken,
      mediaPath,
      rootItemId,
    );
  } catch (error) {
    if (!(error instanceof SitecoreGraphQLError)) {
      throw error;
    }

    return traverseMediaUnderPath(instanceUrl, accessToken, mediaPath);
  }
}

async function searchMediaWithWhereClause(
  instanceUrl: string,
  accessToken: string,
  mediaPath: string,
  rootItemId: string,
): Promise<DiscoveryItem[]> {
  const normalizedPath = normalizePath(mediaPath);
  const searchRootItemId = formatSearchRootItemId(rootItemId);
  const merged = new Map<string, DiscoveryItem>();

  for (const templateName of MEDIA_TEMPLATE_NAME_LIST) {
    let after: string | null = null;
    let hasNext = true;

    while (hasNext) {
      const data: MediaSearchResult = await executeGraphQL<MediaSearchResult>(
        instanceUrl,
        accessToken,
        SEARCH_MEDIA_QUERY,
        {
          rootItemId: searchRootItemId,
          templateName,
          first: SEARCH_PAGE_SIZE,
          after,
        },
      );

      const page = data.search;
      const results = page?.results ?? [];

      for (const item of results) {
        const path = item.path ?? "";
        if (path && path === normalizedPath) {
          continue;
        }

        merged.set(item.id, {
          itemId: normalizeSearchItemId(item.id),
          name: item.name,
          path: path || normalizedPath,
          templateName,
        });
      }

      hasNext = page?.pageInfo?.hasNext ?? false;
      after = page?.pageInfo?.endCursor ?? null;

      if (!hasNext || !after) {
        break;
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

async function traverseMediaUnderPath(
  instanceUrl: string,
  accessToken: string,
  mediaPath: string,
): Promise<DiscoveryItem[]> {
  const normalizedPath = normalizePath(mediaPath);
  const collected = new Map<string, DiscoveryItem>();
  const queue = [normalizedPath];

  while (queue.length > 0) {
    const path = queue.shift()!;
    const data = await executeGraphQL<MediaChildrenResult>(
      instanceUrl,
      accessToken,
      LIST_MEDIA_CHILDREN_QUERY,
      { path },
    );

    const children = data.item?.children?.nodes ?? [];

    for (const child of children) {
      const templateName = child.template?.name ?? "Unknown";

      if (MEDIA_TEMPLATE_NAMES.has(templateName)) {
        collected.set(child.itemId, {
          itemId: child.itemId,
          name: child.name,
          path: child.path,
          templateName,
          templateId: child.template?.templateId,
        });
      }

      if (child.hasChildren && child.path) {
        queue.push(child.path);
      }
    }
  }

  return Array.from(collected.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
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
    (item) => item.templateName === "Template",
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
  const mediaPath = normalizePath(input.mediaPath);
  const templatesPath = normalizePath(input.templatesPath);

  const pathValidation = await Promise.all([
    validatePath(instanceUrl, accessToken, renderingsPath, "Renderings"),
    validatePath(instanceUrl, accessToken, mediaPath, "Media"),
    validatePath(instanceUrl, accessToken, templatesPath, "Templates"),
  ]);

  const allPathsValid = pathValidation.every((result) => result.exists);

  if (!allPathsValid) {
    const missing = pathValidation
      .filter((result) => !result.exists)
      .map((result) => result.label)
      .join(", ");

    return {
      success: false,
      message: `One or more paths were not found: ${missing}.`,
      pathValidation,
      allPathsValid: false,
    };
  }

  const mediaValidation = pathValidation.find(
    (result) => result.label === "Media",
  );

  if (!mediaValidation?.itemId) {
    return {
      success: false,
      message: "Media path was found but its item ID could not be resolved.",
      pathValidation,
      allPathsValid: false,
    };
  }

  const [renderingItems, media, templates] = await Promise.all([
    searchItemsUnderPath(instanceUrl, accessToken, renderingsPath),
    fetchMediaItems(
      instanceUrl,
      accessToken,
      mediaPath,
      mediaValidation.itemId,
    ),
    fetchTemplateDefinitions(instanceUrl, accessToken, templatesPath),
  ]);

  const renderings = renderingItems.filter((item) =>
    RENDERING_TEMPLATE_NAMES.has(item.templateName),
  );

  return {
    success: true,
    message: `Discovery complete for site "${input.siteName}". All paths verified (read-only).`,
    mediaPath,
    pathValidation,
    allPathsValid: true,
    renderings,
    media,
    templates,
  };
}
