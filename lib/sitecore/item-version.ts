import { DEFAULT_MIGRATION_LANGUAGE } from "@/lib/migration/constants";
import { normalizeLanguageCode } from "@/lib/migration/language/language-mapping";
import { normalizeSitecoreItemPath } from "@/lib/migration/target/sitecore-path";
import {
  SitecoreGraphQLError,
  executeGraphQL,
  isMissingItemLanguageVersionError,
} from "@/lib/sitecore/graphql-client";
import {
  ADD_ITEM_VERSION_MUTATION,
  ITEM_BY_PATH_LANGUAGE_QUERY,
  ITEM_VERSION_STRICT_PROBE_QUERY,
} from "@/lib/sitecore/language-queries";
import { UPDATE_ITEM_MUTATION } from "@/lib/sitecore/item-authoring-queries";
import {
  createItemLanguageVersionViaItemService,
  editItemById,
  probeItemByIdInLanguage,
} from "@/lib/sitecore/item-service-client";
import { getSitecoreItemByPath } from "@/lib/sitecore/item-lookup";
import type { SitecoreItemRef } from "@/lib/sitecore/item-lookup";

interface ItemByPathLanguageResult {
  item: {
    itemId?: string;
    name?: string;
    path?: string;
    language?: {
      name?: string;
    } | null;
  } | null;
}

type StrictVersionProbeResult = "exists" | "missing" | "unavailable";

/** Field reads fail when Sitecore has no language version (path-only probes do not). */
async function probeGraphQLLanguageVersionStrict(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  language: string,
): Promise<StrictVersionProbeResult> {
  const path = normalizeSitecoreItemPath(itemPath);
  try {
    const data = await executeGraphQL<{
      item?: {
        itemId?: string;
        versionProbe?: { value?: string | null } | null;
      } | null;
    }>(instanceUrl, accessToken, ITEM_VERSION_STRICT_PROBE_QUERY, {
      path,
      language,
    });

    if (!data.item?.itemId) {

      return "missing";
    }

    if (data.item.versionProbe !== undefined && data.item.versionProbe !== null) {

      return "exists";
    }

    return "missing";
  } catch (error) {
    if (
      error instanceof SitecoreGraphQLError &&
      isMissingItemLanguageVersionError(error.message)
    ) {

      return "missing";
    }

    return "unavailable";
  }
}

function normalizeItemId(itemId: string): string {
  return itemId.replace(/[{}]/g, "").toLowerCase();
}

function formatBracedItemId(itemId: string): string {
  return `{${normalizeItemId(itemId).toUpperCase()}}`;
}

/** Finds an existing item at a path in any of the candidate source languages. */
export async function resolveExistingItemAtPath(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  sourceLanguages: string[] = [],
): Promise<SitecoreItemRef | null> {
  return findSourceItemForVersion(
    instanceUrl,
    accessToken,
    itemPath,
    sourceLanguages,
  );
}

/** Candidate source languages to copy from when creating a missing target version. */
export function buildVersionSourceLanguageCandidates(
  targetLanguage: string,
  preferredSourceLanguages: string[] = [],
): string[] {
  const normalizedTarget = normalizeLanguageCode(targetLanguage);
  const candidates: string[] = [];

  for (const language of preferredSourceLanguages) {
    const trimmed = language.trim();
    if (!trimmed) {
      continue;
    }
    if (normalizeLanguageCode(trimmed) === normalizedTarget) {
      continue;
    }
    candidates.push(trimmed);
  }

  const base = targetLanguage.split("-")[0]?.trim();
  if (base && normalizeLanguageCode(base) !== normalizedTarget) {
    candidates.push(base);
  }

  for (const fallback of [
    DEFAULT_MIGRATION_LANGUAGE,
    "en",
    "en-US",
    "en-IN",
  ]) {
    if (normalizeLanguageCode(fallback) !== normalizedTarget) {
      candidates.push(fallback);
    }
  }

  return [...new Set(candidates)];
}

async function queryItemByPathGraphQL(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  language: string,
): Promise<SitecoreItemRef | null> {
  const path = normalizeSitecoreItemPath(itemPath);
  try {
    const data = await executeGraphQL<ItemByPathLanguageResult>(
      instanceUrl,
      accessToken,
      ITEM_BY_PATH_LANGUAGE_QUERY,
      { path, language },
    );

    if (!data.item?.itemId || !data.item.path) {

      return null;
    }

    return {
      itemId: data.item.itemId,
      name: data.item.name ?? "",
      path: data.item.path,
    };
  } catch (error) {
    if (
      error instanceof SitecoreGraphQLError &&
      isMissingItemLanguageVersionError(error.message)
    ) {

      return null;
    }

    throw error;
  }
}

async function confirmGraphQLItemInLanguage(
  instanceUrl: string,
  accessToken: string,
  item: SitecoreItemRef,
  language: string,
): Promise<SitecoreItemRef | null> {
  const probe = await probeItemByIdInLanguage(
    instanceUrl,
    accessToken,
    item.itemId,
    language,
    { database: "master" },
  );

  if (probe === "found") {

    return item;
  }
  if (probe === "not-found") {

    return null;
  }

  const strict = await probeGraphQLLanguageVersionStrict(
    instanceUrl,
    accessToken,
    item.path,
    language,
  );
  if (strict === "exists") {

    return item;
  }

  return null;
}

export async function getSitecoreItemByPathInLanguage(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  language: string,
): Promise<SitecoreItemRef | null> {
  const graphItem = await queryItemByPathGraphQL(
    instanceUrl,
    accessToken,
    itemPath,
    language,
  );
  if (!graphItem) {
    return null;
  }

  return confirmGraphQLItemInLanguage(
    instanceUrl,
    accessToken,
    graphItem,
    language,
  );
}

async function findSourceItemForVersion(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  sourceLanguages: string[],
): Promise<SitecoreItemRef | null> {
  for (const sourceLanguage of sourceLanguages) {
    const inLanguage = await getSitecoreItemByPathInLanguage(
      instanceUrl,
      accessToken,
      itemPath,
      sourceLanguage,
    );
    if (inLanguage) {
      return inLanguage;
    }
  }

  return getSitecoreItemByPath(instanceUrl, accessToken, itemPath);
}

type AddVersionInput = Record<string, string>;

async function tryAddItemVersion(
  instanceUrl: string,
  accessToken: string,
  input: AddVersionInput,
): Promise<boolean> {
  try {
    const data = await executeGraphQL<{
      addItemVersion?: {
        item?: { itemId?: string } | null;
      } | null;
    }>(instanceUrl, accessToken, ADD_ITEM_VERSION_MUTATION, { input });

    const ok = Boolean(data.addItemVersion?.item?.itemId);

    return ok;
  } catch {
    return false;
  }
}

async function createLanguageVersionViaGraphQLPathUpdate(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  targetLanguage: string,
  sourceLanguage?: string,
): Promise<boolean> {
  const path = normalizeSitecoreItemPath(itemPath);
  const language = targetLanguage.trim();
  const database = "master";

  let label = path.split("/").pop() ?? "Item";
  if (sourceLanguage?.trim()) {
    const source = await queryItemByPathGraphQL(
      instanceUrl,
      accessToken,
      path,
      sourceLanguage.trim(),
    );
    if (source?.name) {
      label = source.name;
    }
  }


  try {
    await executeGraphQL<{
      updateItem?: {
        item?: { itemId?: string } | null;
      } | null;
    }>(instanceUrl, accessToken, UPDATE_ITEM_MUTATION, {
      input: {
        path,
        language,
        database,
        fields: [{ name: "__Display name", value: label, reset: false }],
      },
    });

    const created = await getSitecoreItemByPathInLanguage(
      instanceUrl,
      accessToken,
      path,
      language,
    );
    if (created) {
      return true;
    }
  } catch {
    // try next strategy
  }

  return false;
}

async function createLanguageVersion(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  itemId: string,
  targetLanguage: string,
  sourceLanguage?: string,
): Promise<boolean> {
  const path = normalizeSitecoreItemPath(itemPath);
  const language = targetLanguage.trim();
  const database = "master";
  const normalizedId = normalizeItemId(itemId);
  const bracedId = formatBracedItemId(itemId);


  const viaPathUpdate = await createLanguageVersionViaGraphQLPathUpdate(
    instanceUrl,
    accessToken,
    path,
    language,
    sourceLanguage,
  );
  if (viaPathUpdate) {

    return true;
  }

  const attempts: AddVersionInput[] = [
    { itemId: normalizedId, language },
    { itemId: bracedId, language },
    { itemId: normalizedId, language, database },
    { itemId: bracedId, language, database },
    { path, language },
    { path, language, database },
  ];

  if (sourceLanguage?.trim()) {
    const source = sourceLanguage.trim();
    attempts.push(
      { itemId: normalizedId, language, baseLanguage: source },
      { itemId: bracedId, language, baseLanguage: source },
      { itemId: normalizedId, language, sourceLanguage: source },
      { itemId: normalizedId, language, baseLanguage: source, database },
      { path, language, baseLanguage: source, database },
    );
  }

  for (const input of attempts) {

    const added = await tryAddItemVersion(instanceUrl, accessToken, input);
    if (added) {

      return true;
    }
  }

  const patched = await createItemLanguageVersionViaItemService(
    instanceUrl,
    accessToken,
    normalizedId,
    language,
    sourceLanguage,
    { database },
  );
  if (patched) {
    const created = await getSitecoreItemByPathInLanguage(
      instanceUrl,
      accessToken,
      path,
      language,
    );
    if (created) {
      return true;
    }
  }

  try {
    const sourceItem = sourceLanguage?.trim()
      ? await getSitecoreItemByPathInLanguage(
          instanceUrl,
          accessToken,
          path,
          sourceLanguage.trim(),
        )
      : null;
    const bootstrapFields: Record<string, string> = {};
    if (sourceItem?.name) {
      bootstrapFields.ItemName = sourceItem.name;
    }

    if (Object.keys(bootstrapFields).length > 0) {
      await editItemById(
        instanceUrl,
        accessToken,
        normalizedId,
        bootstrapFields,
        { language, database },
      );
      const created = await getSitecoreItemByPathInLanguage(
        instanceUrl,
        accessToken,
        path,
        language,
      );
      if (created) {
        return true;
      }
    }
  } catch {
    // try next strategy
  }

  return false;
}

export interface EnsureItemLanguageVersionOptions {
  sourceLanguage?: string;
  sourceLanguages?: string[];
}

/**
 * Ensures an item has a language version before field/layout writes.
 * Creates a new version from an existing language when the target version is missing.
 */
export async function ensureItemLanguageVersion(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  targetLanguage: string,
  options?: EnsureItemLanguageVersionOptions,
): Promise<{ createdVersion: boolean; itemId?: string }> {
  const path = normalizeSitecoreItemPath(itemPath);
  const language = targetLanguage.trim();
  if (!path || !language) {
    return { createdVersion: false };
  }


  const existing = await getSitecoreItemByPathInLanguage(
    instanceUrl,
    accessToken,
    path,
    language,
  );
  if (existing) {

    return { createdVersion: false, itemId: existing.itemId };
  }

  const sourceLanguageCandidates = buildVersionSourceLanguageCandidates(
    language,
    [
      ...(options?.sourceLanguages ?? []),
      ...(options?.sourceLanguage ? [options.sourceLanguage] : []),
    ],
  );


  const sourceItem = await findSourceItemForVersion(
    instanceUrl,
    accessToken,
    path,
    sourceLanguageCandidates,
  );

  if (!sourceItem) {

    return { createdVersion: false };
  }


  for (const sourceLanguage of sourceLanguageCandidates) {
    const inSource = await getSitecoreItemByPathInLanguage(
      instanceUrl,
      accessToken,
      path,
      sourceLanguage,
    );
    if (!inSource) {

      continue;
    }


    const added = await createLanguageVersion(
      instanceUrl,
      accessToken,
      path,
      inSource.itemId,
      language,
      sourceLanguage,
    );

    if (added) {
      const created = await getSitecoreItemByPathInLanguage(
        instanceUrl,
        accessToken,
        path,
        language,
      );

      return { createdVersion: true, itemId: created?.itemId };
    }

  }


  const addedFromFallback = await createLanguageVersion(
    instanceUrl,
    accessToken,
    path,
    sourceItem.itemId,
    language,
    sourceLanguageCandidates[0],
  );

  if (addedFromFallback) {
    const created = await getSitecoreItemByPathInLanguage(
      instanceUrl,
      accessToken,
      path,
      language,
    );

    return { createdVersion: true, itemId: created?.itemId };
  }

  throw new Error(
    `Could not create language version "${language}" at ${path}. The item exists in another language but addItemVersion failed.`,
  );
}

export type ItemLanguageVersionState =
  | { status: "ready"; itemId: string; createdVersion: boolean }
  | { status: "item-not-found" };

/**
 * Checks whether an item has a version in the target language. When the item exists
 * in another language but not the target, creates the language version first and
 * verifies it exists before any field/layout writes.
 */
export async function requireItemLanguageVersionBeforeWrite(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  targetLanguage: string,
  options?: EnsureItemLanguageVersionOptions,
): Promise<ItemLanguageVersionState> {
  const path = normalizeSitecoreItemPath(itemPath);
  const language = targetLanguage.trim();
  if (!path || !language) {

    return { status: "item-not-found" };
  }


  const existing = await getSitecoreItemByPathInLanguage(
    instanceUrl,
    accessToken,
    path,
    language,
  );
  if (existing) {

    return {
      status: "ready",
      itemId: existing.itemId,
      createdVersion: false,
    };
  }

  const sourceLanguageCandidates = buildVersionSourceLanguageCandidates(
    language,
    [
      ...(options?.sourceLanguages ?? []),
      ...(options?.sourceLanguage ? [options.sourceLanguage] : []),
    ],
  );

  const itemInAnyLanguage = await resolveExistingItemAtPath(
    instanceUrl,
    accessToken,
    path,
    sourceLanguageCandidates,
  );
  if (!itemInAnyLanguage) {

    return { status: "item-not-found" };
  }


  const result = await ensureItemLanguageVersion(
    instanceUrl,
    accessToken,
    path,
    language,
    options,
  );

  const verified = await getSitecoreItemByPathInLanguage(
    instanceUrl,
    accessToken,
    path,
    language,
  );
  if (!verified?.itemId) {

    throw new Error(
      `Language version "${language}" is required at ${path} before writing content, but version creation failed.`,
    );
  }


  return {
    status: "ready",
    itemId: verified.itemId,
    createdVersion: result.createdVersion,
  };
}

export async function ensureItemsLanguageVersions(
  instanceUrl: string,
  accessToken: string,
  itemPaths: string[],
  targetLanguage: string,
  options?: EnsureItemLanguageVersionOptions,
): Promise<void> {
  const uniquePaths = [
    ...new Set(
      itemPaths
        .map((itemPath) => normalizeSitecoreItemPath(itemPath))
        .filter(Boolean),
    ),
  ];

  for (const path of uniquePaths) {

    const version = await requireItemLanguageVersionBeforeWrite(
      instanceUrl,
      accessToken,
      path,
      targetLanguage,
      options,
    );
    if (version.status === "item-not-found") {
      throw new Error(
        `Item not found at ${path}. Create the item before migrating content in "${targetLanguage}".`,
      );
    }
  }
}
