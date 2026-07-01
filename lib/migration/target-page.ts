import { DEFAULT_MIGRATION_LANGUAGE } from "@/lib/migration/constants";
import { normalizeSitecoreItemPath } from "@/lib/migration/sitecore-path";
import { ensureSxaPageDataItem } from "@/lib/migration/sxa-page-structure";
import { SEARCH_UNDER_PATH_QUERY } from "@/lib/sitecore/discovery/queries";
import { executeGraphQL } from "@/lib/sitecore/graphql-client";
import {
  getSitecoreItemByPath,
} from "@/lib/sitecore/item-lookup";
import {
  createItem,
  splitSitecoreItemPath,
} from "@/lib/sitecore/item-service-client";

const SKIP_SIBLING_NAMES = new Set([
  "data",
  "presentation",
  "settings",
  "shared",
  "dictionary",
  "templates",
]);

export interface TargetPageValidation {
  path: string;
  /** Actual Sitecore path used (may differ when matched by item name). */
  resolvedPath: string;
  exists: boolean;
  itemId?: string;
  name?: string;
}

interface SearchUnderPathResult {
  search?: {
    results?: Array<{
      innerItem?: {
        itemId?: string;
        name?: string;
        path?: string;
        template?: {
          name?: string;
          templateId?: string;
        } | null;
      } | null;
    }>;
  } | null;
}

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase();
}

function isSkippedChildItem(name: string, path: string): boolean {
  const nameLower = name.toLowerCase();
  if (SKIP_SIBLING_NAMES.has(nameLower)) {
    return true;
  }
  const normalized = normalizeSitecoreItemPath(path);
  return normalized.endsWith("/Data") || normalized.endsWith("/Presentation");
}

/** True when itemPath is an immediate child of parentPath (not nested deeper). */
export function isDirectChildItem(parentPath: string, itemPath: string): boolean {
  const parent = normalizeSitecoreItemPath(parentPath).replace(/\/$/, "");
  const item = normalizeSitecoreItemPath(itemPath);
  if (!item.startsWith(`${parent}/`)) {
    return false;
  }
  const remainder = item.slice(parent.length + 1);
  return remainder.length > 0 && !remainder.includes("/");
}

async function findChildPageByItemName(
  instanceUrl: string,
  accessToken: string,
  parentPath: string,
  itemName: string,
): Promise<{ path: string; itemId: string; name: string } | null> {
  const normalizedParent = normalizeSitecoreItemPath(parentPath);
  const targetName = normalizeItemName(itemName);

  const data = await executeGraphQL<SearchUnderPathResult>(
    instanceUrl,
    accessToken,
    SEARCH_UNDER_PATH_QUERY,
    { path: normalizedParent, pageSize: 100, pageIndex: 0 },
  );

  for (const result of data.search?.results ?? []) {
    const item = result.innerItem;
    if (!item?.path || !item.name || !item.itemId) {
      continue;
    }

    const itemPath = normalizeSitecoreItemPath(item.path);
    if (!isDirectChildItem(normalizedParent, itemPath)) {
      continue;
    }

    if (isSkippedChildItem(item.name, itemPath)) {
      continue;
    }

    if (normalizeItemName(item.name) !== targetName) {
      continue;
    }

    return {
      path: itemPath,
      itemId: item.itemId,
      name: item.name,
    };
  }

  return null;
}

async function resolveExistingTargetPage(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
): Promise<{ exists: boolean; path: string; itemId?: string; name?: string }> {
  const normalizedPath = normalizeSitecoreItemPath(pagePath);
  const existing = await getSitecoreItemByPath(
    instanceUrl,
    accessToken,
    normalizedPath,
  );
  if (existing) {
    return {
      exists: true,
      path: normalizedPath,
      itemId: existing.itemId,
      name: existing.name,
    };
  }

  try {
    const { parentPath, itemName } = splitSitecoreItemPath(normalizedPath);
    const byName = await findChildPageByItemName(
      instanceUrl,
      accessToken,
      parentPath,
      itemName,
    );
    if (byName) {
      return {
        exists: true,
        path: byName.path,
        itemId: byName.itemId,
        name: byName.name,
      };
    }
  } catch {
    // Invalid path shape — treat as missing.
  }

  return { exists: false, path: normalizedPath };
}

function uniqueNormalizedPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of paths) {
    const path = normalizeSitecoreItemPath(raw);
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    result.push(path);
  }
  return result;
}

export async function validateTargetPagePaths(
  instanceUrl: string,
  accessToken: string,
  paths: string[],
): Promise<TargetPageValidation[]> {
  const unique = uniqueNormalizedPaths(paths);
  const results: TargetPageValidation[] = [];

  for (const path of unique) {
    const resolved = await resolveExistingTargetPage(
      instanceUrl,
      accessToken,
      path,
    );
    results.push({
      path,
      resolvedPath: resolved.path,
      exists: resolved.exists,
      itemId: resolved.itemId,
      name: resolved.name,
    });
  }

  return results;
}

async function resolvePageTemplateId(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
  pageTemplatePath?: string,
): Promise<string> {
  if (pageTemplatePath?.trim()) {
    const configured = await getSitecoreItemByPath(
      instanceUrl,
      accessToken,
      pageTemplatePath,
    );
    if (configured?.itemId) {
      return configured.itemId.replace(/[{}]/g, "");
    }
    throw new Error(
      `Page template not found at ${pageTemplatePath}. Set a valid page template path in Discovery.`,
    );
  }

  const { parentPath } = splitSitecoreItemPath(pagePath);
  const data = await executeGraphQL<SearchUnderPathResult>(
    instanceUrl,
    accessToken,
    SEARCH_UNDER_PATH_QUERY,
    { path: parentPath, pageSize: 25, pageIndex: 0 },
  );

  const siblings = data.search?.results ?? [];
  for (const result of siblings) {
    const item = result.innerItem;
    if (!item?.path || !item.template?.templateId) {
      continue;
    }

    const normalizedPath = normalizeSitecoreItemPath(item.path);
    if (normalizedPath === normalizeSitecoreItemPath(pagePath)) {
      continue;
    }

    const nameLower = (item.name ?? "").toLowerCase();
    if (SKIP_SIBLING_NAMES.has(nameLower)) {
      continue;
    }

    if (normalizedPath.endsWith("/Data") || normalizedPath.endsWith("/Presentation")) {
      continue;
    }

    return item.template.templateId.replace(/[{}]/g, "");
  }

  throw new Error(
    `Could not infer a page template for ${pagePath}. Add a sibling page under ${parentPath} or set "Page template path" in Discovery.`,
  );
}

export interface EnsureTargetPageOptions {
  language?: string;
  pageTemplatePath?: string;
  sxaPageDataTemplatePath?: string;
}

export async function ensureTargetPageExists(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
  options?: EnsureTargetPageOptions,
): Promise<{ created: boolean; path: string }> {
  const normalizedPath = normalizeSitecoreItemPath(pagePath);
  const resolved = await resolveExistingTargetPage(
    instanceUrl,
    accessToken,
    normalizedPath,
  );

  if (resolved.exists) {
    await ensureSxaPageDataItem(instanceUrl, accessToken, resolved.path, {
      language: options?.language,
      sxaPageDataTemplatePath: options?.sxaPageDataTemplatePath,
    });
    return { created: false, path: resolved.path };
  }

  const { parentPath, itemName } = splitSitecoreItemPath(normalizedPath);
  const parent = await getSitecoreItemByPath(
    instanceUrl,
    accessToken,
    parentPath,
  );
  if (!parent) {
    throw new Error(
      `Parent folder not found at ${parentPath}. Create the parent folder in Sitecore first.`,
    );
  }

  const templateId = await resolvePageTemplateId(
    instanceUrl,
    accessToken,
    normalizedPath,
    options?.pageTemplatePath,
  );

  await createItem(
    instanceUrl,
    accessToken,
    parentPath,
    itemName,
    templateId,
    {},
    { language: options?.language ?? DEFAULT_MIGRATION_LANGUAGE },
  );

  const created = await getSitecoreItemByPath(
    instanceUrl,
    accessToken,
    normalizedPath,
  );
  if (!created) {
    throw new Error(`Failed to create target page at ${normalizedPath}.`);
  }

  await ensureSxaPageDataItem(instanceUrl, accessToken, normalizedPath, {
    language: options?.language,
    sxaPageDataTemplatePath: options?.sxaPageDataTemplatePath,
  });

  return { created: true, path: normalizedPath };
}

export async function ensureTargetPagesExist(
  instanceUrl: string,
  accessToken: string,
  paths: string[],
  options?: EnsureTargetPageOptions,
): Promise<{
  created: string[];
  existing: string[];
  pathByRequested: Record<string, string>;
}> {
  const unique = uniqueNormalizedPaths(paths);
  const created: string[] = [];
  const existing: string[] = [];
  const pathByRequested: Record<string, string> = {};

  for (const path of unique) {
    const result = await ensureTargetPageExists(
      instanceUrl,
      accessToken,
      path,
      options,
    );
    pathByRequested[path] = result.path;
    if (result.created) {
      created.push(result.path);
    } else {
      existing.push(result.path);
    }
  }

  return { created, existing, pathByRequested };
}

/** Map requested target paths to existing Sitecore paths (exact path or sibling name). */
export async function resolveQueueTargetPagePaths(
  instanceUrl: string,
  accessToken: string,
  paths: string[],
): Promise<Record<string, string>> {
  const unique = uniqueNormalizedPaths(paths);
  const pathByRequested: Record<string, string> = {};

  for (const path of unique) {
    const resolved = await resolveExistingTargetPage(
      instanceUrl,
      accessToken,
      path,
    );
    pathByRequested[path] = resolved.path;
  }

  return pathByRequested;
}
