import { normalizeInstanceUrl } from "@/lib/sitecore/auth";
import { executeGraphQL } from "@/lib/sitecore/graphql-client";
import {
  GET_INSTANCE_LANGUAGES_QUERY,
  SITE_ROOT_IN_LANGUAGE_QUERY,
} from "@/lib/sitecore/language-queries";
import type { SitecoreLanguage } from "@/types/language";

const ITEM_SERVICE_LANGUAGES_PATH = "/sitecore/api/ssc/item/languages";

interface InstanceLanguagesGraphQLResult {
  item: {
    children?: {
      nodes?: Array<{
        name: string;
        path?: string;
        fields?: {
          nodes?: Array<{ name: string; value?: string }>;
        };
      }>;
    };
  } | null;
}

interface SiteRootInLanguageResult {
  item: {
    itemId?: string;
    name?: string;
    path?: string;
  } | null;
}

interface ItemServiceLanguageRow {
  Name?: string;
  DisplayName?: string;
  EnglishName?: string;
  NativeName?: string;
  RegionalIsoCode?: string;
}

function fieldValue(
  fields: Array<{ name: string; value?: string }> | undefined,
  fieldName: string,
): string | undefined {
  const value = fields?.find((field) => field.name === fieldName)?.value?.trim();
  return value || undefined;
}

function parseInstanceLanguageNode(
  node: NonNullable<
    NonNullable<InstanceLanguagesGraphQLResult["item"]>["children"]
  >["nodes"][number],
): SitecoreLanguage {
  const fields = node.fields?.nodes ?? [];
  return {
    name: node.name,
    path: node.path,
    iso: fieldValue(fields, "Regional Iso Code") ?? node.name,
    englishName: fieldValue(fields, "English name"),
    nativeName: fieldValue(fields, "Native name"),
  };
}

function sortLanguages(languages: SitecoreLanguage[]): SitecoreLanguage[] {
  return [...languages].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function fetchInstanceLanguagesViaItemService(
  instanceUrl: string,
  accessToken: string,
): Promise<SitecoreLanguage[] | null> {
  const url = `${normalizeInstanceUrl(instanceUrl)}${ITEM_SERVICE_LANGUAGES_PATH}?database=master`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    await response.text();
    return null;
  }

  const payload = (await response.json()) as
    | ItemServiceLanguageRow[]
    | { Languages?: ItemServiceLanguageRow[] };

  const rows = Array.isArray(payload)
    ? payload
    : (payload.Languages ?? []);

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const languages = sortLanguages(
    rows
      .map((row) => ({
        name: row.Name?.trim() ?? "",
        iso: row.RegionalIsoCode?.trim() || row.Name?.trim(),
        englishName: row.EnglishName?.trim() || row.DisplayName?.trim(),
        nativeName: row.NativeName?.trim(),
      }))
      .filter((language) => Boolean(language.name)),
  );

  return languages;
}

export async function fetchInstanceLanguages(
  instanceUrl: string,
  accessToken: string,
): Promise<SitecoreLanguage[]> {
  const fromItemService = await fetchInstanceLanguagesViaItemService(
    instanceUrl,
    accessToken,
  );
  if (fromItemService?.length) {
    return fromItemService;
  }

  const data = await executeGraphQL<InstanceLanguagesGraphQLResult>(
    instanceUrl,
    accessToken,
    GET_INSTANCE_LANGUAGES_QUERY,
  );

  const nodes = data.item?.children?.nodes ?? [];
  return sortLanguages(nodes.map(parseInstanceLanguageNode));
}

async function siteRootExistsInLanguage(
  instanceUrl: string,
  accessToken: string,
  siteRootPath: string,
  languageName: string,
): Promise<boolean> {
  const data = await executeGraphQL<SiteRootInLanguageResult>(
    instanceUrl,
    accessToken,
    SITE_ROOT_IN_LANGUAGE_QUERY,
    { path: siteRootPath, language: languageName },
  );

  return Boolean(data.item?.itemId);
}

/**
 * Resolves languages available on a site by probing the site root item per
 * instance language. Authoring GraphQL does not expose item.languages (that is
 * a Delivery API field), so we check which language versions exist.
 */
export async function fetchSiteLanguages(
  instanceUrl: string,
  accessToken: string,
  siteRootPath: string,
): Promise<SitecoreLanguage[]> {
  const normalizedRoot = siteRootPath.trim().replace(/\/+$/, "") || siteRootPath;

  const instanceLanguages = await fetchInstanceLanguages(
    instanceUrl,
    accessToken,
  );

  if (instanceLanguages.length === 0) {
    return [];
  }

  const available: SitecoreLanguage[] = [];

  for (const language of instanceLanguages) {
    try {
      const exists = await siteRootExistsInLanguage(
        instanceUrl,
        accessToken,
        normalizedRoot,
        language.name,
      );
      if (exists) {
        available.push(language);
      }
    } catch {
      // skip languages that cannot be probed
    }
  }

  if (available.length > 0) {
    return sortLanguages(available);
  }

  return instanceLanguages;
}
