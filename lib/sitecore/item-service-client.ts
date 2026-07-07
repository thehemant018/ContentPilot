import { normalizeInstanceUrl } from "@/lib/sitecore/auth";
import { executeGraphQL } from "@/lib/sitecore/graphql-client";
import {
  CREATE_ITEM_MUTATION,
  UPDATE_ITEM_MUTATION,
} from "@/lib/sitecore/item-authoring-queries";
import { getSitecoreItemByPath } from "@/lib/sitecore/item-lookup";

const ITEM_SERVICE_PATH = "/sitecore/api/ssc/item";
export const DEFAULT_ITEM_DATABASE = "master";

export interface ItemServiceOptions {
  database?: string;
  language?: string;
  version?: string;
}

export interface ItemServiceItem {
  ItemID?: string;
  ItemName?: string;
  ItemPath?: string;
  TemplateID?: string;
  [key: string]: unknown;
}

function toServicePath(sitecorePath: string): string {
  return sitecorePath
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildItemServiceUrl(
  instanceUrl: string,
  itemPath: string,
  options?: ItemServiceOptions,
): string {
  const base = `${normalizeInstanceUrl(instanceUrl)}${ITEM_SERVICE_PATH}/${toServicePath(itemPath)}`;
  const params = new URLSearchParams();
  params.set("database", options?.database ?? DEFAULT_ITEM_DATABASE);
  if (options?.language) {
    params.set("language", options.language);
  }
  if (options?.version) {
    params.set("version", options.version);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

async function parseItemServiceResponse(
  response: Response,
): Promise<ItemServiceItem> {
  if (response.status === 204) {
    return {};
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as ItemServiceItem;
  } catch {
    throw new Error(
      `Item Service returned invalid JSON (${response.status}): ${text.slice(0, 200)}`,
    );
  }
}

type ItemServiceReadStatus = "found" | "not-found" | "unavailable";

async function readItemServiceGet(
  url: string,
  accessToken: string,
  context: string,
): Promise<{ status: ItemServiceReadStatus; item?: ItemServiceItem }> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return { status: "not-found" };
  }

  if (!response.ok) {
    await response.text();
    return { status: "unavailable" };
  }

  const item = await parseItemServiceResponse(response);
  if (!item.ItemID) {
    return { status: "not-found" };
  }

  return { status: "found", item };
}

/** Sitecore expects field names at the JSON root, not under a Fields property. */
export function buildItemServiceFieldPayload(
  fields: Record<string, string>,
): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const [name, value] of Object.entries(fields)) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      continue;
    }
    payload[trimmedName] = value;
  }
  return payload;
}

function toGraphQLFieldInputs(
  fields: Record<string, string>,
): Array<{ name: string; value: string; reset: boolean }> {
  return Object.entries(buildItemServiceFieldPayload(fields)).map(
    ([name, value]) => ({
      name,
      value,
      reset: false,
    }),
  );
}

function normalizeItemId(itemId: string): string {
  return itemId.replace(/[{}]/g, "").toLowerCase();
}

/** Plain UUID for GraphQL Guid/ID fields (createItem, updateItem). */
export function formatSitecoreGraphQLItemId(itemId: string): string {
  return normalizeItemId(itemId);
}

function buildItemServiceUrlById(
  instanceUrl: string,
  itemId: string,
  options?: ItemServiceOptions,
): string {
  const base = `${normalizeInstanceUrl(instanceUrl)}${ITEM_SERVICE_PATH}/${normalizeItemId(itemId)}`;
  const params = new URLSearchParams();
  params.set("database", options?.database ?? DEFAULT_ITEM_DATABASE);
  if (options?.language) {
    params.set("language", options.language);
  }
  if (options?.version) {
    params.set("version", options.version);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export async function getItemById(
  instanceUrl: string,
  accessToken: string,
  itemId: string,
  options?: ItemServiceOptions,
): Promise<ItemServiceItem | null> {
  const url = buildItemServiceUrlById(instanceUrl, itemId, options);
  const read = await readItemServiceGet(
    url,
    accessToken,
    `item ${itemId} (${options?.language ?? "default"})`,
  );
  if (read.status === "found") {
    return read.item ?? null;
  }
  return null;
}

export async function probeItemByIdInLanguage(
  instanceUrl: string,
  accessToken: string,
  itemId: string,
  language: string,
  options?: ItemServiceOptions,
): Promise<ItemServiceReadStatus> {
  const url = buildItemServiceUrlById(instanceUrl, itemId, {
    ...options,
    language,
  });
  const read = await readItemServiceGet(
    url,
    accessToken,
    `item ${itemId} (${language})`,
  );
  return read.status;
}

/**
 * Creates a language version by PATCHing the item in the target language.
 * Copies the item name from a source language version when available.
 */
export async function createItemLanguageVersionViaItemService(
  instanceUrl: string,
  accessToken: string,
  itemId: string,
  targetLanguage: string,
  sourceLanguage?: string,
  options?: ItemServiceOptions,
): Promise<boolean> {
  const database = options?.database ?? DEFAULT_ITEM_DATABASE;
  let itemName: string | undefined;

  if (sourceLanguage?.trim()) {
    const sourceItem = await getItemById(instanceUrl, accessToken, itemId, {
      database,
      language: sourceLanguage.trim(),
    });
    itemName =
      (typeof sourceItem?.ItemName === "string" && sourceItem.ItemName.trim()) ||
      undefined;
  }

  const url = buildItemServiceUrlById(instanceUrl, itemId, {
    database,
    language: targetLanguage,
  });
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(itemName ? { ItemName: itemName } : {}),
    cache: "no-store",
  });

  if (response.ok) {
    return true;
  }

  await response.text();
  return false;
}

export async function getItemByPath(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  options?: ItemServiceOptions,
): Promise<ItemServiceItem | null> {
  const url = buildItemServiceUrl(instanceUrl, itemPath, options);
  const read = await readItemServiceGet(
    url,
    accessToken,
    `${itemPath} (${options?.language ?? "default"})`,
  );
  if (read.status === "found") {
    return read.item ?? null;
  }
  return null;
}

export async function createItem(
  instanceUrl: string,
  accessToken: string,
  parentPath: string,
  itemName: string,
  templateId: string,
  fields: Record<string, string>,
  options?: ItemServiceOptions,
): Promise<ItemServiceItem> {
  const language = options?.language ?? "en";
  const parent = await getSitecoreItemByPath(
    instanceUrl,
    accessToken,
    parentPath,
  );
  if (!parent) {
    throw new Error(`Parent item not found at ${parentPath}.`);
  }

  const graphqlFields = toGraphQLFieldInputs(fields);
  const data = await executeGraphQL<{
    createItem?: {
      item?: {
        itemId?: string;
        name?: string;
        path?: string;
      } | null;
    } | null;
  }>(instanceUrl, accessToken, CREATE_ITEM_MUTATION, {
    input: {
      name: itemName,
      parent: formatSitecoreGraphQLItemId(parent.itemId),
      templateId: formatSitecoreGraphQLItemId(templateId),
      language,
      fields: graphqlFields,
    },
  });

  const created = data.createItem?.item;
  if (!created?.itemId) {
    throw new Error(
      `Authoring GraphQL createItem failed under ${parentPath}: no item returned.`,
    );
  }

  return {
    ItemID: created.itemId,
    ItemName: created.name,
    ItemPath: created.path,
  };
}

export async function editItemById(
  instanceUrl: string,
  accessToken: string,
  itemId: string,
  fields: Record<string, string>,
  options?: ItemServiceOptions,
): Promise<ItemServiceItem> {
  const graphqlFields = toGraphQLFieldInputs(fields);
  if (graphqlFields.length === 0) {
    return {};
  }

  const data = await executeGraphQL<{
    updateItem?: {
      item?: {
        itemId?: string;
        name?: string;
        path?: string;
      } | null;
    } | null;
  }>(instanceUrl, accessToken, UPDATE_ITEM_MUTATION, {
    input: {
      itemId: formatSitecoreGraphQLItemId(itemId),
      database: options?.database ?? DEFAULT_ITEM_DATABASE,
      language: options?.language ?? "en",
      fields: graphqlFields,
    },
  });

  const updated = data.updateItem?.item;
  if (!updated?.itemId) {
    throw new Error(
      `Authoring GraphQL updateItem failed for ${itemId}: no item returned.`,
    );
  }

  return {
    ItemID: updated.itemId,
    ItemName: updated.name,
    ItemPath: updated.path,
  };
}

export function splitSitecoreItemPath(fullPath: string): {
  parentPath: string;
  itemName: string;
} {
  const normalized = fullPath.trim().replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) {
    throw new Error(`Invalid Sitecore item path: ${fullPath}`);
  }

  return {
    parentPath: normalized.slice(0, lastSlash),
    itemName: normalized.slice(lastSlash + 1),
  };
}
