import path from "node:path";
import { executeGraphQL } from "@/lib/sitecore/graphql-client";
import { formatSitecoreGuid } from "@/lib/sitecore/layout-xml";
import { UPLOAD_MEDIA_MUTATION } from "@/lib/sitecore/media-queries";

export interface UploadMediaResult {
  itemId: string;
  itemPath?: string;
  sourceUrl: string;
}

interface UploadMediaMutationResult {
  uploadMedia?: {
    presignedUploadUrl?: string | null;
  } | null;
}

interface PresignedUploadPayload {
  id?: string;
  Id?: string;
  itemPath?: string;
  ItemPath?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

/** Path relative to the media library root for uploadMedia.itemPath. */
export function normalizeMediaUploadPath(configuredPath: string): string {
  const trimmed = configuredPath.trim();
  if (!trimmed) {
    throw new Error(
      "Media library path is required. Set it in the Discovery phase.",
    );
  }

  let normalized = trimmed.replace(/^\/+/, "");
  normalized = normalized.replace(/^sitecore\/media\s*library\/?/i, "");
  normalized = normalized.replace(/^sitecore\/media\/?/i, "");
  return normalized.replace(/\/+$/, "");
}

export function sanitizeMediaFileStem(value: string): string {
  return value
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .toLowerCase();
}

export function buildMediaItemPath(
  mediaFolderPath: string,
  sourceUrl: string,
  uniqueSuffix: string,
): { itemPath: string; fileName: string } {
  const folderPath = normalizeMediaUploadPath(mediaFolderPath);

  let ext = ".jpg";
  let stem = "image";

  try {
    const url = new URL(sourceUrl);
    const parsed = path.parse(url.pathname);
    if (parsed.ext) {
      ext = parsed.ext.toLowerCase();
    }
    if (parsed.name) {
      stem = sanitizeMediaFileStem(parsed.name);
    }
  } catch {
    // Keep defaults for invalid URLs.
  }

  const itemName = `${stem}-${uniqueSuffix.slice(0, 8)}`;
  const itemPath = folderPath ? `${folderPath}/${itemName}` : itemName;
  return {
    itemPath,
    fileName: `${itemName}${ext}`,
  };
}

function getMimeType(fileName: string): string {
  return MIME_BY_EXT[path.extname(fileName).toLowerCase()] || "application/octet-stream";
}

export function formatSitecoreImageFieldValue(mediaItemId: string): string {
  return `<image mediaid="${formatSitecoreGuid(mediaItemId)}" />`;
}

export function isHttpImageFieldValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("<image")) {
    return false;
  }
  return /^https?:\/\//i.test(trimmed);
}

export function resolveAbsoluteImageUrl(
  value: string,
  sourcePageUrl?: string,
): string {
  const trimmed = value.trim();
  try {
    return new URL(trimmed, sourcePageUrl || undefined).href;
  } catch {
    return trimmed;
  }
}

async function getPresignedUploadUrl(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  options?: { language?: string; alt?: string },
): Promise<string> {
  const data = await executeGraphQL<UploadMediaMutationResult>(
    instanceUrl,
    accessToken,
    UPLOAD_MEDIA_MUTATION,
    {
      itemPath,
      language: options?.language ?? "en",
      alt: options?.alt,
    },
  );

  const presignedUploadUrl = data.uploadMedia?.presignedUploadUrl;
  if (!presignedUploadUrl) {
    throw new Error("uploadMedia did not return presignedUploadUrl.");
  }

  return presignedUploadUrl;
}

async function downloadImage(sourceUrl: string): Promise<{
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}> {
  const response = await fetch(sourceUrl, {
    redirect: "follow",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download image (${response.status}) from ${sourceUrl}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Downloaded image was empty: ${sourceUrl}`);
  }

  let fileName = "image.jpg";
  try {
    const url = new URL(sourceUrl);
    const parsed = path.parse(url.pathname);
    if (parsed.name) {
      fileName = `${sanitizeMediaFileStem(parsed.name)}${parsed.ext || ".jpg"}`;
    }
  } catch {
    // Keep default file name.
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  const mimeType =
    contentType && contentType.startsWith("image/")
      ? contentType
      : getMimeType(fileName);

  return { buffer, fileName, mimeType };
}

async function uploadBufferToPresignedUrl(
  presignedUploadUrl: string,
  accessToken: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<PresignedUploadPayload> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    fileName,
  );

  const response = await fetch(presignedUploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | PresignedUploadPayload
    | null;

  if (!response.ok) {
    throw new Error(
      `Media upload failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  if (!payload) {
    throw new Error("Media upload returned an empty response.");
  }

  return payload;
}

export async function uploadImageFromUrl(
  instanceUrl: string,
  accessToken: string,
  sourceUrl: string,
  options: {
    mediaFolderPath: string;
    uniqueSuffix: string;
    language?: string;
    alt?: string;
  },
): Promise<UploadMediaResult> {
  const absoluteUrl = resolveAbsoluteImageUrl(sourceUrl);
  const { itemPath, fileName } = buildMediaItemPath(
    options.mediaFolderPath,
    absoluteUrl,
    options.uniqueSuffix,
  );

  const { buffer, fileName: downloadedName, mimeType } =
    await downloadImage(absoluteUrl);

  const presignedUploadUrl = await getPresignedUploadUrl(
    instanceUrl,
    accessToken,
    itemPath,
    { language: options.language, alt: options.alt },
  );

  const result = await uploadBufferToPresignedUrl(
    presignedUploadUrl,
    accessToken,
    buffer,
    fileName || downloadedName,
    mimeType,
  );

  const itemId = result.id ?? result.Id;
  if (!itemId) {
    throw new Error(
      `Media upload succeeded but no item ID was returned for ${itemPath}.`,
    );
  }

  return {
    itemId,
    itemPath: result.itemPath ?? result.ItemPath ?? itemPath,
    sourceUrl: absoluteUrl,
  };
}
