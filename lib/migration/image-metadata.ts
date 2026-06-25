import path from "node:path";
import {
  isHttpImageFieldValue,
  resolveAbsoluteImageUrl,
  sanitizeMediaFileStem,
} from "@/lib/sitecore/media-upload";
import type { CrawlImage } from "@/types/crawl";
import type { EditableFieldValue } from "@/types/migration-queue";

export function findImageAltForUrl(
  blockImages: CrawlImage[],
  imageUrl: string,
  sourcePageUrl: string,
): string | undefined {
  const target = resolveAbsoluteImageUrl(imageUrl, sourcePageUrl);

  for (const image of blockImages) {
    if (resolveAbsoluteImageUrl(image.src, sourcePageUrl) === target) {
      const alt = image.alt.trim();
      if (alt) {
        return alt;
      }
    }
  }

  return undefined;
}

/** Prefer crawled alt text, then the file name from the image URL. */
export function resolveMediaDisplayName(
  alt?: string,
  sourceUrl?: string,
): string | undefined {
  const trimmedAlt = alt?.trim();
  if (trimmedAlt) {
    return trimmedAlt;
  }

  if (!sourceUrl) {
    return undefined;
  }

  try {
    const parsed = path.parse(new URL(sourceUrl).pathname);
    if (parsed.name) {
      return parsed.name.replace(/[-_]+/g, " ").trim();
    }
  } catch {
    // Ignore invalid URLs.
  }

  return undefined;
}

export function enrichImageFieldAlts(
  fields: EditableFieldValue[],
  blockImages: CrawlImage[],
  sourcePageUrl: string,
): EditableFieldValue[] {
  return fields.map((field) => {
    if (field.imageAlt?.trim()) {
      return field;
    }

    if (!isHttpImageFieldValue(field.value)) {
      return field;
    }

    const alt = findImageAltForUrl(blockImages, field.value, sourcePageUrl);
    return alt ? { ...field, imageAlt: alt } : field;
  });
}

export function resolveMediaItemStem(
  alt: string | undefined,
  sourceUrl: string,
): string | undefined {
  const displayName = resolveMediaDisplayName(alt, sourceUrl);
  return displayName ? sanitizeMediaFileStem(displayName) : undefined;
}

export function buildMediaCandidateStems(
  alt: string | undefined,
  sourceUrl: string,
): string[] {
  const stems = new Set<string>();
  const fromAlt = resolveMediaItemStem(alt, sourceUrl);
  if (fromAlt) {
    stems.add(fromAlt);
  }

  try {
    const parsed = path.parse(new URL(sourceUrl).pathname);
    if (parsed.name) {
      stems.add(sanitizeMediaFileStem(parsed.name));
    }
  } catch {
    // Ignore invalid URLs.
  }

  return [...stems];
}
