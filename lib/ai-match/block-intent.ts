import { blockTypeKeywords } from "@/lib/ai-match/block-keywords";
import type { FlatContentBlock } from "@/types/ai-match";
import type { ContentBlock, SemanticBlockType } from "@/types/crawl";

const VIDEO_EMBED_PATTERN =
  /<iframe[^>]+src=["'][^"']*(youtube|youtu\.be|vimeo|player\.vimeo)/i;

const QUOTE_HEADING_PATTERN =
  /\b(featured quote|pull quote|customer quote)\b/i;

const QUOTE_SELECTOR_PATTERN =
  /\b(quote|pull-quote|blockquote|featured-quote)\b/i;

const VIDEO_SELECTOR_PATTERN = /\b(video|youtube|embed|media-player)\b/i;

const CARD_GRID_SELECTOR_PATTERN =
  /\b(services|features|cards|card-grid|stories|testimonials|grid)\b/i;

function blockSignals(block: ContentBlock | FlatContentBlock) {
  const classAndId =
    `${block.selector} ${block.heading ?? ""}`.toLowerCase();
  const html = block.htmlSnippet.toLowerCase();
  const blockquoteCount = (block.htmlSnippet.match(/<blockquote\b/gi) ?? [])
    .length;
  const figureCount = (block.htmlSnippet.match(/<figure\b/gi) ?? []).length;
  const articleCount = (block.htmlSnippet.match(/<article\b/gi) ?? []).length;
  const hasVideoEmbed = VIDEO_EMBED_PATTERN.test(block.htmlSnippet);
  const hasBlockquote = blockquoteCount > 0;

  return {
    classAndId,
    html,
    blockquoteCount,
    figureCount,
    articleCount,
    hasVideoEmbed,
    hasBlockquote,
    imageCount: block.images.length,
  };
}

function isMultiItemSection(signals: ReturnType<typeof blockSignals>): boolean {
  return (
    signals.articleCount >= 3 ||
    (signals.articleCount >= 2 &&
      CARD_GRID_SELECTOR_PATTERN.test(signals.classAndId)) ||
    (signals.figureCount >= 2 && signals.blockquoteCount >= 2) ||
    (signals.figureCount >= 2 &&
      CARD_GRID_SELECTOR_PATTERN.test(signals.classAndId))
  );
}

export function inferMatchingBlockType(
  block: ContentBlock | FlatContentBlock,
): SemanticBlockType {
  if (block.type === "hero") {
    return "hero";
  }

  const signals = blockSignals(block);

  if (
    signals.hasVideoEmbed ||
    VIDEO_SELECTOR_PATTERN.test(signals.classAndId)
  ) {
    return "video";
  }

  if (
    block.type === "card-grid" ||
    isMultiItemSection(signals)
  ) {
    return "card-grid";
  }

  if (
    QUOTE_SELECTOR_PATTERN.test(signals.classAndId) ||
    QUOTE_HEADING_PATTERN.test(block.heading ?? "") ||
    (signals.hasBlockquote &&
      signals.figureCount <= 1 &&
      signals.articleCount === 0 &&
      !CARD_GRID_SELECTOR_PATTERN.test(signals.classAndId))
  ) {
    return "quote";
  }

  if (block.type === "media") {
    return "media";
  }

  if (block.type === "cta") {
    return "cta";
  }

  if (block.type === "form") {
    return "form";
  }

  if (
    block.type === "rich-text" ||
    block.type === "section" ||
    block.type === "unknown"
  ) {
    return "rich-text";
  }

  return block.type;
}

export function refineBlockForMatching<T extends FlatContentBlock>(
  block: T,
): T {
  const matchingType = inferMatchingBlockType(block);
  if (matchingType === block.type) {
    return block;
  }

  return { ...block, type: matchingType };
}

export function describeBlockSignals(block: FlatContentBlock): string {
  const signals = blockSignals(block);
  const parts: string[] = [];

  if (block.parentBlockId) {
    parts.push(`parent:${block.parentBlockId}`);
  }
  if (signals.hasVideoEmbed) {
    parts.push("video-embed");
  }
  if (signals.hasBlockquote) {
    parts.push(`blockquote:${signals.blockquoteCount}`);
  }
  if (signals.figureCount >= 1) {
    parts.push(`figures:${signals.figureCount}`);
  }
  if (signals.articleCount >= 2) {
    parts.push(`articles:${signals.articleCount}`);
  }
  if (signals.imageCount > 0) {
    parts.push(`images:${signals.imageCount}`);
  }

  return parts.join(",");
}

export function matchKeywordsForBlock(block: FlatContentBlock): string[] {
  const matchingType = inferMatchingBlockType(block);
  const keywords = new Set<string>();

  for (const keyword of blockTypeKeywords(matchingType)) {
    keywords.add(keyword);
  }

  if (matchingType === "quote") {
    ["quote", "pull quote", "blockquote"].forEach((word) =>
      keywords.add(word),
    );
  }

  if (matchingType === "video") {
    ["video", "youtube", "embed", "media"].forEach((word) =>
      keywords.add(word),
    );
  }

  if (block.heading) {
    const heading = block.heading.toLowerCase();
    if (QUOTE_HEADING_PATTERN.test(heading)) {
      keywords.add("quote");
    }
    if (/video|youtube|watch/i.test(heading)) {
      ["video", "youtube"].forEach((word) => keywords.add(word));
    }
  }

  if (QUOTE_SELECTOR_PATTERN.test(block.selector.toLowerCase())) {
    keywords.add("quote");
  }
  if (VIDEO_SELECTOR_PATTERN.test(block.selector.toLowerCase())) {
    keywords.add("video");
  }

  return [...keywords];
}
