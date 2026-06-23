import { normalizeInstanceUrl } from "@/lib/sitecore/auth";

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

function buildItemServiceIdUrl(
  instanceUrl: string,
  itemId: string,
  options?: ItemServiceOptions,
): string {
  const normalizedId = itemId.replace(/[{}]/g, "");
  const params = new URLSearchParams();
  params.set("database", options?.database ?? DEFAULT_ITEM_DATABASE);
  if (options?.language) {
    params.set("language", options.language);
  }
  if (options?.version) {
    params.set("version", options.version);
  }
  const query = params.toString();
  return `${normalizeInstanceUrl(instanceUrl)}${ITEM_SERVICE_PATH}/${normalizedId}?${query}`;
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

function extractCreatedItemId(response: Response): string | undefined {
  const location = response.headers.get("Location") ?? "";
  const match = location.match(
    /\/item\/([0-9a-f-]{36})/i,
  );
  return match?.[1];
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

export async function getItemByPath(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  options?: ItemServiceOptions,
): Promise<ItemServiceItem | null> {
  const url = buildItemServiceUrl(instanceUrl, itemPath, options);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Item Service GET failed (${response.status}) for ${itemPath}: ${body.slice(0, 200)}`,
    );
  }

  return parseItemServiceResponse(response);
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
  const url = buildItemServiceUrl(instanceUrl, parentPath, options);
  const fieldPayload = buildItemServiceFieldPayload(fields);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      ItemName: itemName,
      TemplateID: templateId,
      ItemLanguage: options?.language ?? "en",
      ...fieldPayload,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Item Service create failed (${response.status}) under ${parentPath}: ${body.slice(0, 300)}`,
    );
  }

  const created = await parseItemServiceResponse(response);
  const createdItemId = created.ItemID ?? extractCreatedItemId(response);
  if (createdItemId) {
    created.ItemID = createdItemId;
  }

  return created;
}

export async function editItemById(
  instanceUrl: string,
  accessToken: string,
  itemId: string,
  fields: Record<string, string>,
  options?: ItemServiceOptions,
): Promise<ItemServiceItem> {
  const fieldPayload = buildItemServiceFieldPayload(fields);
  if (Object.keys(fieldPayload).length === 0) {
    return {};
  }

  const url = buildItemServiceIdUrl(instanceUrl, itemId, options);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(fieldPayload),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Item Service edit failed (${response.status}) for ${itemId}: ${body.slice(0, 300)}`,
    );
  }

  return parseItemServiceResponse(response);
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
