import { normalizeSitecoreItemPath } from "@/lib/migration/target/sitecore-path";
import { ensureSxaPageDataItem } from "@/lib/migration/target/sxa-page-structure";
import { buildSxaDatasourceParentPath } from "@/lib/sitecore/item-lookup";
import {
  type EnsureItemLanguageVersionOptions,
  requireItemLanguageVersionBeforeWrite,
} from "@/lib/sitecore/item-version";

export interface EnsurePageLanguageContextOptions
  extends EnsureItemLanguageVersionOptions {
  sxaPageDataTemplatePath?: string;
}

/**
 * Ensures the target page and its SXA Data folder have a language version
 * before datasource fields or presentation are written for that language.
 */
export async function ensurePageLanguageContext(
  instanceUrl: string,
  accessToken: string,
  pagePath: string,
  language: string,
  options?: EnsurePageLanguageContextOptions,
): Promise<{ pageItemId: string; dataItemId: string }> {
  const normalizedPagePath = normalizeSitecoreItemPath(pagePath);
  const versionOptions: EnsureItemLanguageVersionOptions = {
    sourceLanguage: options?.sourceLanguage,
    sourceLanguages: options?.sourceLanguages,
  };

  const pageVersion = await requireItemLanguageVersionBeforeWrite(
    instanceUrl,
    accessToken,
    normalizedPagePath,
    language,
    versionOptions,
  );

  if (pageVersion.status === "item-not-found") {
    throw new Error(
      `Target page not found at ${normalizedPagePath}. Create the page before migrating content in "${language}".`,
    );
  }

  await ensureSxaPageDataItem(instanceUrl, accessToken, normalizedPagePath, {
    language,
    sxaPageDataTemplatePath: options?.sxaPageDataTemplatePath,
    sourceLanguages: options?.sourceLanguages,
    sourceLanguage: options?.sourceLanguage,
  });

  const dataPath = buildSxaDatasourceParentPath(normalizedPagePath);
  const dataVersion = await requireItemLanguageVersionBeforeWrite(
    instanceUrl,
    accessToken,
    dataPath,
    language,
    versionOptions,
  );

  if (dataVersion.status === "item-not-found") {
    throw new Error(
      `SXA Data item not found at ${dataPath} for language "${language}".`,
    );
  }

  return {
    pageItemId: pageVersion.itemId,
    dataItemId: dataVersion.itemId,
  };
}
