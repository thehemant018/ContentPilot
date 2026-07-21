import { ensureItemLanguageVersion, getSitecoreItemByPathInLanguage } from "@/lib/sitecore/item-version";
import { DEFAULT_MIGRATION_LANGUAGE } from "@/lib/migration/constants";
import { normalizeSitecoreItemPath } from "@/lib/migration/target/sitecore-path";
import { SEARCH_UNDER_PATH_QUERY } from "@/lib/sitecore/discovery/queries";
import { executeGraphQL } from "@/lib/sitecore/graphql-client";
import {
  buildSxaDatasourceParentPath,
  getSitecoreItemByPath,
  getSitecoreItemWithTemplate,
} from "@/lib/sitecore/item-lookup";
import {
  createItem,
  splitSitecoreItemPath,
} from "@/lib/sitecore/item-service-client";

/** Standard SXA local datasource folder template for page-level Data item. */
export const DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH =
  "/sitecore/templates/Foundation/Experience Accelerator/Local Datasources/Page Data";

export const SXA_PAGE_DATA_ITEM_NAME = "Data";

export interface EnsureSxaPageDataOptions {
  language?: string;
  sxaPageDataTemplatePath?: string;
  /** Pre-resolved template id — skips repeated template lookups in a batch. */
  pageDataTemplateId?: string;
  /**
   * When true, skip the initial page language probe (caller already verified
   * the page exists in the target language).
   */
  pageVerifiedInLanguage?: boolean;
  sourceLanguage?: string;
  sourceLanguages?: string[];
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

const SKIP_SIBLING_NAMES = new Set([
  "data",
  "presentation",
  "settings",
  "shared",
  "dictionary",
  "templates",
]);

function normalizeTemplateId(templateId: string): string {
  return templateId.replace(/[{}]/g, "");
}

async function resolvePageDataTemplateIdFromPath(
  instanceUrl: string,
  accessToken: string,
  templatePath: string,
): Promise<string | null> {
  const item = await getSitecoreItemByPath(
    instanceUrl,
    accessToken,
    templatePath,
  );
  if (!item?.itemId) {
    return null;
  }
  return normalizeTemplateId(item.itemId);
}

async function resolvePageDataTemplateIdFromSibling(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
): Promise<string | null> {
  const { parentPath } = splitSitecoreItemPath(pagePath);
  const data = await executeGraphQL<SearchUnderPathResult>(
    instanceUrl,
    accessToken,
    SEARCH_UNDER_PATH_QUERY,
    { path: parentPath, pageSize: 25, pageIndex: 0 },
  );

  for (const result of data.search?.results ?? []) {
    const item = result.innerItem;
    if (!item?.path) {
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

    const siblingDataPath = buildSxaDatasourceParentPath(normalizedPath);
    const dataItem = await getSitecoreItemWithTemplate(
      instanceUrl,
      accessToken,
      siblingDataPath,
    );
    if (dataItem?.templateId) {
      return normalizeTemplateId(dataItem.templateId);
    }
  }

  return null;
}

async function resolvePageDataTemplateId(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
  sxaPageDataTemplatePath?: string,
): Promise<string> {
  const configuredPath =
    sxaPageDataTemplatePath?.trim() || DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH;

  const fromConfigured = await resolvePageDataTemplateIdFromPath(
    instanceUrl,
    accessToken,
    configuredPath,
  );
  if (fromConfigured) {
    return fromConfigured;
  }

  if (sxaPageDataTemplatePath?.trim()) {
    throw new Error(
      `SXA Page Data template not found at ${configuredPath}. Check Discovery settings.`,
    );
  }

  const fromSibling = await resolvePageDataTemplateIdFromSibling(
    instanceUrl,
    accessToken,
    pagePath,
  );
  if (fromSibling) {
    return fromSibling;
  }

  throw new Error(
    `Could not resolve SXA Page Data template for ${pagePath}. Set "SXA Page Data template path" in Discovery or ensure a sibling page has a Data item.`,
  );
}

/** Resolves the SXA Page Data template id (for batch caching). */
export async function resolveSxaPageDataTemplateId(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
  sxaPageDataTemplatePath?: string,
): Promise<string> {
  return resolvePageDataTemplateId(
    instanceUrl,
    accessToken,
    pagePath,
    sxaPageDataTemplatePath,
  );
}

/**
 * Ensures the SXA page-level Data item exists under a target page.
 * Required for datasource items at {page}/Data/{component}.
 */
export async function ensureSxaPageDataItem(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
  options?: EnsureSxaPageDataOptions,
): Promise<{ created: boolean; path: string }> {
  const normalizedPagePath = normalizeSitecoreItemPath(pagePath);
  const dataPath = buildSxaDatasourceParentPath(normalizedPagePath);
  const language = options?.language ?? DEFAULT_MIGRATION_LANGUAGE;
  const versionOptions = {
    sourceLanguage: options?.sourceLanguage,
    sourceLanguages: options?.sourceLanguages,
  };

  if (!options?.pageVerifiedInLanguage) {
    const pageInLanguage = await getSitecoreItemByPathInLanguage(
      instanceUrl,
      accessToken,
      normalizedPagePath,
      language,
    );
    if (!pageInLanguage) {
      const pageItem = await getSitecoreItemByPath(
        instanceUrl,
        accessToken,
        normalizedPagePath,
      );
      if (!pageItem) {
        throw new Error(
          `Target page not found at ${normalizedPagePath}. Create the page before adding SXA Data.`,
        );
      }

      await ensureItemLanguageVersion(
        instanceUrl,
        accessToken,
        normalizedPagePath,
        language,
        versionOptions,
      );

      const pageVerified = await getSitecoreItemByPathInLanguage(
        instanceUrl,
        accessToken,
        normalizedPagePath,
        language,
      );
      if (!pageVerified) {
        throw new Error(
          `Could not create "${language}" version for page at ${normalizedPagePath} before creating SXA Data.`,
        );
      }
    }
  }

  const dataInLanguage = await getSitecoreItemByPathInLanguage(
    instanceUrl,
    accessToken,
    dataPath,
    language,
  );
  if (dataInLanguage) {
    return { created: false, path: dataPath };
  }

  const dataInAnyLanguage = await getSitecoreItemByPath(
    instanceUrl,
    accessToken,
    dataPath,
  );
  if (dataInAnyLanguage) {
    await ensureItemLanguageVersion(
      instanceUrl,
      accessToken,
      dataPath,
      language,
      versionOptions,
    );

    const dataVerified = await getSitecoreItemByPathInLanguage(
      instanceUrl,
      accessToken,
      dataPath,
      language,
    );
    if (!dataVerified) {
      throw new Error(
        `Could not create "${language}" version for SXA Data at ${dataPath} before writing content.`,
      );
    }

    return { created: false, path: dataPath };
  }

  if (!options?.pageVerifiedInLanguage) {
    const pageItem = await getSitecoreItemByPathInLanguage(
      instanceUrl,
      accessToken,
      normalizedPagePath,
      language,
    );
    if (!pageItem) {
      throw new Error(
        `Target page not found at ${normalizedPagePath} in "${language}".`,
      );
    }
  }

  const templateId =
    options?.pageDataTemplateId?.trim() ||
    (await resolvePageDataTemplateId(
      instanceUrl,
      accessToken,
      normalizedPagePath,
      options?.sxaPageDataTemplatePath,
    ));

  await createItem(
    instanceUrl,
    accessToken,
    normalizedPagePath,
    SXA_PAGE_DATA_ITEM_NAME,
    templateId,
    {},
    { language },
  );

  const created = await getSitecoreItemByPathInLanguage(
    instanceUrl,
    accessToken,
    dataPath,
    language,
  );
  if (!created) {
    throw new Error(
      `Failed to create SXA Data item at ${dataPath} in "${language}" (Page Data template).`,
    );
  }

  return { created: true, path: dataPath };
}
