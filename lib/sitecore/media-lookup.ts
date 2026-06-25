import { SEARCH_UNDER_PATH_QUERY } from "@/lib/sitecore/discovery/queries";
import { executeGraphQL } from "@/lib/sitecore/graphql-client";
import { getSitecoreItemByPath } from "@/lib/sitecore/item-lookup";
import type { UploadMediaResult } from "@/lib/sitecore/media-upload";

interface SearchResult {
  search?: {
    results?: Array<{
      innerItem: {
        itemId: string;
        name: string;
        path: string;
        template?: { name?: string };
      };
    }>;
  };
}

const SEARCH_PAGE_SIZE = 500;

function normalizeMediaLibraryFolderPath(path: string): string {
  let normalized = path.trim().replace(/\/+$/, "");
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  return normalized;
}

export function isSitecoreImageFieldValue(value: string): boolean {
  return /<image\s+mediaid=/i.test(value.trim());
}

export function parseSitecoreImageFieldMediaId(value: string): string | null {
  const match = value.trim().match(/mediaid="([^"]+)"/i);
  return match?.[1]?.trim() || null;
}

export function isSitecoreMediaPathValue(value: string): boolean {
  const trimmed = value.trim();
  return /^\/sitecore\/media/i.test(trimmed);
}

export function buildSitecoreMediaFullPath(
  mediaLibraryPath: string,
  itemName: string,
): string {
  return `${normalizeMediaLibraryFolderPath(mediaLibraryPath)}/${itemName}`;
}

function isLikelyMediaTemplate(templateName: string | undefined): boolean {
  if (!templateName) {
    return false;
  }
  return /image|media|jpeg|jpg|png|gif|webp|svg|bmp|icon/i.test(templateName);
}

async function searchMediaItemsUnderPath(
  instanceUrl: string,
  accessToken: string,
  folderPath: string,
): Promise<Array<{ itemId: string; name: string; path: string }>> {
  const normalizedPath = normalizeMediaLibraryFolderPath(folderPath);
  const data = await executeGraphQL<SearchResult>(
    instanceUrl,
    accessToken,
    SEARCH_UNDER_PATH_QUERY,
    { path: normalizedPath, pageSize: SEARCH_PAGE_SIZE, pageIndex: 0 },
  );

  return (data.search?.results ?? [])
    .map((result) => result.innerItem)
    .filter(
      (item) =>
        item.path !== normalizedPath && isLikelyMediaTemplate(item.template?.name),
    )
    .map((item) => ({
      itemId: item.itemId,
      name: item.name,
      path: item.path,
    }));
}

function toUploadResult(
  item: { itemId: string; path: string },
  sourceUrl: string,
): UploadMediaResult {
  return {
    itemId: item.itemId,
    itemPath: item.path,
    sourceUrl,
  };
}

export async function findExistingMediaItem(
  instanceUrl: string,
  accessToken: string,
  mediaLibraryPath: string,
  candidateStems: string[],
  folderSearchCache?: Map<string, Array<{ itemId: string; name: string; path: string }>>,
): Promise<UploadMediaResult | null> {
  const folder = normalizeMediaLibraryFolderPath(mediaLibraryPath);
  const uniqueStems = [
    ...new Set(candidateStems.map((stem) => stem.trim()).filter(Boolean)),
  ];

  for (const stem of uniqueStems) {
    const item = await getSitecoreItemByPath(
      instanceUrl,
      accessToken,
      buildSitecoreMediaFullPath(folder, stem),
    );
    if (item) {
      return toUploadResult(item, "");
    }
  }

  let folderItems = folderSearchCache?.get(folder);
  if (!folderItems) {
    folderItems = await searchMediaItemsUnderPath(
      instanceUrl,
      accessToken,
      folder,
    );
    folderSearchCache?.set(folder, folderItems);
  }

  const stemsLower = uniqueStems.map((stem) => stem.toLowerCase());

  for (const item of folderItems) {
    const nameLower = item.name.toLowerCase();
    if (stemsLower.includes(nameLower)) {
      return toUploadResult(item, "");
    }

    for (const stem of stemsLower) {
      if (nameLower.startsWith(`${stem}-`)) {
        return toUploadResult(item, "");
      }
    }
  }

  return null;
}

export async function resolveExistingMediaFromFieldValue(
  instanceUrl: string,
  accessToken: string,
  value: string,
): Promise<UploadMediaResult | null> {
  const trimmed = value.trim();

  if (isSitecoreImageFieldValue(trimmed)) {
    const mediaId = parseSitecoreImageFieldMediaId(trimmed);
    if (mediaId) {
      return { itemId: mediaId, sourceUrl: trimmed };
    }
    return null;
  }

  if (!isSitecoreMediaPathValue(trimmed)) {
    return null;
  }

  const item = await getSitecoreItemByPath(instanceUrl, accessToken, trimmed);
  if (!item) {
    return null;
  }

  return toUploadResult(item, trimmed);
}
