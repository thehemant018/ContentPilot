import {
  mapWithConcurrency,
  TARGET_PAGE_ENSURE_CONCURRENCY,
} from "@/lib/migration/concurrency";
import { DEFAULT_MIGRATION_LANGUAGE } from "@/lib/migration/constants";
import { normalizeSitecoreItemPath } from "@/lib/migration/sitecore-path";
import {
  ensureSxaPageDataItem,
  resolveSxaPageDataTemplateId,
  DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH,
} from "@/lib/migration/sxa-page-structure";
import {
  getSitecoreItemByPathInLanguage,
  requireItemLanguageVersionBeforeWrite,
} from "@/lib/sitecore/item-version";
import { SEARCH_UNDER_PATH_QUERY } from "@/lib/sitecore/discovery/queries";
import { executeGraphQL } from "@/lib/sitecore/graphql-client";
import {
  getSitecoreItemByPath,
  type SitecoreItemRef,
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

/** Shared lookups for a multi-page ensure/validate batch. */
export interface TargetPageEnsureCache {
  itemByPath: Map<string, Promise<SitecoreItemRef | null>>;
  searchUnderParent: Map<string, Promise<SearchUnderPathResult>>;
  pageTemplateIdByKey: Map<string, Promise<string>>;
  sxaDataTemplateIdByKey: Map<string, Promise<string>>;
}

export function createTargetPageEnsureCache(): TargetPageEnsureCache {
  return {
    itemByPath: new Map(),
    searchUnderParent: new Map(),
    pageTemplateIdByKey: new Map(),
    sxaDataTemplateIdByKey: new Map(),
  };
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

function getCachedItemByPath(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  cache?: TargetPageEnsureCache,
): Promise<SitecoreItemRef | null> {
  const normalized = normalizeSitecoreItemPath(itemPath);
  if (!cache) {
    return getSitecoreItemByPath(instanceUrl, accessToken, normalized);
  }

  const existing = cache.itemByPath.get(normalized);
  if (existing) {
    return existing;
  }

  const pending = getSitecoreItemByPath(instanceUrl, accessToken, normalized);
  cache.itemByPath.set(normalized, pending);
  return pending;
}

function getCachedSearchUnderParent(
  instanceUrl: string,
  accessToken: string,
  parentPath: string,
  pageSize: number,
  cache?: TargetPageEnsureCache,
): Promise<SearchUnderPathResult> {
  const normalizedParent = normalizeSitecoreItemPath(parentPath);
  if (!cache) {
    return executeGraphQL<SearchUnderPathResult>(
      instanceUrl,
      accessToken,
      SEARCH_UNDER_PATH_QUERY,
      { path: normalizedParent, pageSize, pageIndex: 0 },
    );
  }

  const cacheKey = `${normalizedParent}::${pageSize}`;
  const existing = cache.searchUnderParent.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = executeGraphQL<SearchUnderPathResult>(
    instanceUrl,
    accessToken,
    SEARCH_UNDER_PATH_QUERY,
    { path: normalizedParent, pageSize, pageIndex: 0 },
  );
  cache.searchUnderParent.set(cacheKey, pending);
  return pending;
}

async function findChildPageByItemName(
  instanceUrl: string,
  accessToken: string,
  parentPath: string,
  itemName: string,
  cache?: TargetPageEnsureCache,
): Promise<{ path: string; itemId: string; name: string } | null> {
  const normalizedParent = normalizeSitecoreItemPath(parentPath);
  const targetName = normalizeItemName(itemName);

  const data = await getCachedSearchUnderParent(
    instanceUrl,
    accessToken,
    normalizedParent,
    100,
    cache,
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
  cache?: TargetPageEnsureCache,
): Promise<{ exists: boolean; path: string; itemId?: string; name?: string }> {
  const normalizedPath = normalizeSitecoreItemPath(pagePath);
  const existing = await getCachedItemByPath(
    instanceUrl,
    accessToken,
    normalizedPath,
    cache,
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
      cache,
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
  const cache = createTargetPageEnsureCache();

  return mapWithConcurrency(
    unique,
    TARGET_PAGE_ENSURE_CONCURRENCY,
    async (path) => {
      const resolved = await resolveExistingTargetPage(
        instanceUrl,
        accessToken,
        path,
        cache,
      );
      return {
        path,
        resolvedPath: resolved.path,
        exists: resolved.exists,
        itemId: resolved.itemId,
        name: resolved.name,
      };
    },
  );
}

async function resolvePageTemplateId(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
  pageTemplatePath: string | undefined,
  cache?: TargetPageEnsureCache,
): Promise<string> {
  const configuredPath = pageTemplatePath?.trim();
  const { parentPath } = splitSitecoreItemPath(pagePath);
  const cacheKey = configuredPath
    ? `path:${normalizeSitecoreItemPath(configuredPath)}`
    : `infer:${normalizeSitecoreItemPath(parentPath)}`;

  const resolve = async (): Promise<string> => {
    if (configuredPath) {
      const configured = await getCachedItemByPath(
        instanceUrl,
        accessToken,
        configuredPath,
        cache,
      );
      if (configured?.itemId) {
        return configured.itemId.replace(/[{}]/g, "");
      }
      throw new Error(
        `Page template not found at ${configuredPath}. Set a valid page template path in Discovery.`,
      );
    }

    const data = await getCachedSearchUnderParent(
      instanceUrl,
      accessToken,
      parentPath,
      25,
      cache,
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

      if (
        normalizedPath.endsWith("/Data") ||
        normalizedPath.endsWith("/Presentation")
      ) {
        continue;
      }

      return item.template.templateId.replace(/[{}]/g, "");
    }

    throw new Error(
      `Could not infer a page template for ${pagePath}. Add a sibling page under ${parentPath} or set "Page template path" in Discovery.`,
    );
  };

  if (!cache) {
    return resolve();
  }

  const existing = cache.pageTemplateIdByKey.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = resolve();
  cache.pageTemplateIdByKey.set(cacheKey, pending);
  return pending;
}

async function resolveCachedSxaDataTemplateId(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
  sxaPageDataTemplatePath: string | undefined,
  cache?: TargetPageEnsureCache,
): Promise<string> {
  const configuredPath =
    sxaPageDataTemplatePath?.trim() || DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH;
  const cacheKey = `path:${normalizeSitecoreItemPath(configuredPath)}`;

  const resolve = () =>
    resolveSxaPageDataTemplateId(
      instanceUrl,
      accessToken,
      pagePath,
      sxaPageDataTemplatePath,
    );

  if (!cache) {
    return resolve();
  }

  const existing = cache.sxaDataTemplateIdByKey.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = resolve();
  cache.sxaDataTemplateIdByKey.set(cacheKey, pending);
  return pending;
}

export interface EnsureTargetPageOptions {
  language?: string;
  pageTemplatePath?: string;
  sxaPageDataTemplatePath?: string;
  sourceLanguage?: string;
  sourceLanguages?: string[];
  cache?: TargetPageEnsureCache;
}

export async function ensureTargetPageExists(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
  options?: EnsureTargetPageOptions,
): Promise<{ created: boolean; path: string }> {
  const normalizedPath = normalizeSitecoreItemPath(pagePath);
  const cache = options?.cache;
  const resolved = await resolveExistingTargetPage(
    instanceUrl,
    accessToken,
    normalizedPath,
    cache,
  );

  const language = options?.language ?? DEFAULT_MIGRATION_LANGUAGE;
  const versionOptions = {
    sourceLanguage: options?.sourceLanguage,
    sourceLanguages: options?.sourceLanguages,
  };

  const sxaDataTemplateId = await resolveCachedSxaDataTemplateId(
    instanceUrl,
    accessToken,
    resolved.exists ? resolved.path : normalizedPath,
    options?.sxaPageDataTemplatePath,
    cache,
  ).catch(() => undefined);

  if (resolved.exists) {
    const pageVersion = await requireItemLanguageVersionBeforeWrite(
      instanceUrl,
      accessToken,
      resolved.path,
      language,
      versionOptions,
    );
    if (pageVersion.status === "item-not-found") {
      throw new Error(`Target page not found at ${resolved.path}.`);
    }

    await ensureSxaPageDataItem(instanceUrl, accessToken, resolved.path, {
      language,
      sxaPageDataTemplatePath: options?.sxaPageDataTemplatePath,
      pageDataTemplateId: sxaDataTemplateId,
      pageVerifiedInLanguage: true,
      sourceLanguages: options?.sourceLanguages,
      sourceLanguage: options?.sourceLanguage,
    });
    return { created: false, path: resolved.path };
  }

  const { parentPath, itemName } = splitSitecoreItemPath(normalizedPath);
  const parent = await getCachedItemByPath(
    instanceUrl,
    accessToken,
    parentPath,
    cache,
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
    cache,
  );

  await createItem(
    instanceUrl,
    accessToken,
    parentPath,
    itemName,
    templateId,
    {},
    { language },
  );

  // Newly created path is known — avoid stale negative cache entries.
  cache?.itemByPath.delete(normalizedPath);

  const createdInLanguage = await getSitecoreItemByPathInLanguage(
    instanceUrl,
    accessToken,
    normalizedPath,
    language,
  );
  if (!createdInLanguage) {
    throw new Error(
      `Failed to create target page at ${normalizedPath} in "${language}".`,
    );
  }

  await ensureSxaPageDataItem(instanceUrl, accessToken, normalizedPath, {
    language,
    sxaPageDataTemplatePath: options?.sxaPageDataTemplatePath,
    pageDataTemplateId: sxaDataTemplateId,
    pageVerifiedInLanguage: true,
    sourceLanguages: options?.sourceLanguages,
    sourceLanguage: options?.sourceLanguage,
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
  results: Array<{
    path: string;
    resolvedPath: string;
    created: boolean;
    error?: string;
  }>;
}> {
  const unique = uniqueNormalizedPaths(paths);
  const cache = options?.cache ?? createTargetPageEnsureCache();
  const created: string[] = [];
  const existing: string[] = [];
  const pathByRequested: Record<string, string> = {};

  const results = await mapWithConcurrency(
    unique,
    TARGET_PAGE_ENSURE_CONCURRENCY,
    async (path) => {
      try {
        const result = await ensureTargetPageExists(
          instanceUrl,
          accessToken,
          path,
          { ...options, cache },
        );
        return {
          path,
          resolvedPath: result.path,
          created: result.created,
        };
      } catch (error) {
        return {
          path,
          resolvedPath: path,
          created: false,
          error:
            error instanceof Error ? error.message : "Failed to ensure page.",
        };
      }
    },
  );

  for (const result of results) {
    if (result.error) {
      continue;
    }
    pathByRequested[result.path] = result.resolvedPath;
    if (result.created) {
      created.push(result.resolvedPath);
    } else {
      existing.push(result.resolvedPath);
    }
  }

  return { created, existing, pathByRequested, results };
}

/** Map requested target paths to existing Sitecore paths (exact path or sibling name). */
export async function resolveQueueTargetPagePaths(
  instanceUrl: string,
  accessToken: string,
  paths: string[],
): Promise<Record<string, string>> {
  const unique = uniqueNormalizedPaths(paths);
  const cache = createTargetPageEnsureCache();
  const pathByRequested: Record<string, string> = {};

  const resolved = await mapWithConcurrency(
    unique,
    TARGET_PAGE_ENSURE_CONCURRENCY,
    async (path) => {
      const result = await resolveExistingTargetPage(
        instanceUrl,
        accessToken,
        path,
        cache,
      );
      return { path, resolvedPath: result.path };
    },
  );

  for (const entry of resolved) {
    pathByRequested[entry.path] = entry.resolvedPath;
  }

  return pathByRequested;
}
