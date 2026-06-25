import type { SemanticBlockType } from "@/types/crawl";

/** Crawl block type → keywords used to find matching Sitecore rendering/template names. */
export const BLOCK_TYPE_COMPONENT_KEYWORDS: Record<
  SemanticBlockType,
  readonly string[]
> = {
  hero: ["hero", "banner", "jumbotron", "masthead", "promo"],
  quote: ["quote", "testimonial", "pull quote", "blockquote", "featured quote"],
  video: ["video", "youtube", "vimeo", "embed", "media player"],
  "rich-text": [
    "rich text",
    "richtext",
    "rich-text",
    "rte",
    "content",
    "text",
    "body",
    "article",
    "copy",
  ],
  "card-grid": [
    "card",
    "grid",
    "feature",
    "listing",
    "tiles",
    "carousel",
    "promo",
  ],
  media: ["image", "media", "gallery", "video", "picture", "file"],
  cta: ["cta", "call to action", "button", "link", "promo"],
  navigation: ["navigation", "nav", "menu", "breadcrumb"],
  footer: ["footer"],
  form: ["form", "newsletter", "subscribe", "contact"],
  section: ["section", "container", "split", "column", "wrapper"],
  unknown: [],
};

export function blockTypeKeywords(type: string): string[] {
  const keywords = BLOCK_TYPE_COMPONENT_KEYWORDS[type as SemanticBlockType];
  if (keywords && keywords.length > 0) {
    return [...keywords, type.replace(/-/g, " ")];
  }
  return [type.replace(/-/g, " ")];
}

export function normalizeComponentName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreNameAgainstKeywords(
  name: string,
  keywords: string[],
): number {
  const normalized = normalizeComponentName(name);
  if (!normalized) {
    return 0;
  }

  let score = 0;
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeComponentName(keyword);
    if (!normalizedKeyword) {
      continue;
    }

    if (normalized === normalizedKeyword) {
      score += 100;
      continue;
    }

    if (normalized.startsWith(`${normalizedKeyword} `)) {
      score += 80;
      continue;
    }

    if (normalized.includes(normalizedKeyword)) {
      score += 50;
      continue;
    }

    const wordPattern = new RegExp(
      `\\b${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    );
    if (wordPattern.test(normalized)) {
      score += 40;
    }
  }

  return score;
}
