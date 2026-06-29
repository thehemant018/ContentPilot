import {
  inferMatchingBlockType,
  matchKeywordsForBlock,
} from "@/lib/ai-match/block-intent";
import { scoreNameAgainstKeywords } from "@/lib/ai-match/block-keywords";
import type { FlatContentBlock } from "@/types/ai-match";
import type { DiscoveryItem } from "@/types/discovery";

export const MIN_CATALOG_FIT_SCORE = 40;

export function bestCatalogFitScore(
  block: FlatContentBlock,
  renderings: DiscoveryItem[],
): number {
  const keywords = matchKeywordsForBlock(block);
  let best = 0;

  for (const rendering of renderings) {
    best = Math.max(best, scoreNameAgainstKeywords(rendering.name, keywords));
  }

  return best;
}

export function hasCatalogFit(
  block: FlatContentBlock,
  renderings: DiscoveryItem[],
): boolean {
  return bestCatalogFitScore(block, renderings) >= MIN_CATALOG_FIT_SCORE;
}

/** Blocks that are structurally unlikely to map to a single datasource component. */
export function isCompoundContainerBlock(block: FlatContentBlock): boolean {
  if (block.matchRole === "section-container") {
    return false;
  }

  if (block.subBlocks && block.subBlocks.length >= 2) {
    return true;
  }

  const intent = inferMatchingBlockType(block);
  if (intent === "card-grid") {
    return true;
  }

  const html = block.htmlSnippet;
  const figureCount = (html.match(/<figure\b/gi) ?? []).length;
  const articleCount = (html.match(/<article\b/gi) ?? []).length;
  const blockquoteCount = (html.match(/<blockquote\b/gi) ?? []).length;

  if (figureCount >= 2 && blockquoteCount >= 2) {
    return true;
  }

  if (articleCount >= 3) {
    return true;
  }

  return false;
}

export function isLikelyUnmatchableBlock(
  block: FlatContentBlock,
  renderings: DiscoveryItem[],
): boolean {
  if (isCompoundContainerBlock(block)) {
    return true;
  }

  const intent = inferMatchingBlockType(block);
  if (intent === "rich-text" || intent === "section" || intent === "cta") {
    return !hasCatalogFit(block, renderings);
  }

  return !hasCatalogFit(block, renderings);
}

export function noMatchReason(
  block: FlatContentBlock,
  renderings: DiscoveryItem[],
): string {
  if (isCompoundContainerBlock(block)) {
    if (block.subBlocks && block.subBlocks.length >= 2) {
      return `Compound section split into ${block.subBlocks.length} sub-block(s) for matching. Parent container is not migrated as one item.`;
    }
    return `Compound ${block.type} section (grid/slider) — no matching list/grid rendering in Sitecore discovery. Add a container component, or match sub-items individually.`;
  }

  const intent = inferMatchingBlockType(block);
  const names = renderings.map((item) => item.name).join(", ") || "none";
  return `No Sitecore rendering in discovery fits this ${intent} block. Available: ${names}.`;
}
