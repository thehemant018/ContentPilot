import type { FlatContentBlock } from "@/types/ai-match";
import type { CrawledPage, ContentBlock } from "@/types/crawl";

function toFlatBlock(
  block: ContentBlock,
  page: CrawledPage,
): FlatContentBlock {
  return {
    ...block,
    pageUrl: page.url,
    pageTitle: page.title,
  };
}

/**
 * Expands compound blocks into their sub-blocks for AI matching.
 * Parent containers with 2+ sub-blocks are omitted from the match pass.
 */
export function flattenBlocksForMatching(pages: CrawledPage[]): FlatContentBlock[] {
  const flat: FlatContentBlock[] = [];

  for (const page of pages) {
    for (const block of page.blocks) {
      const subBlocks = block.subBlocks ?? [];

      if (subBlocks.length >= 2) {
        for (const subBlock of subBlocks) {
          flat.push(toFlatBlock(subBlock, page));
        }
        continue;
      }

      flat.push(toFlatBlock(block, page));
    }
  }

  return flat;
}

export function flattenCrawlBlocks(pages: CrawledPage[]): FlatContentBlock[] {
  const flat: FlatContentBlock[] = [];

  for (const page of pages) {
    for (const block of page.blocks) {
      flat.push(toFlatBlock(block, page));
    }
  }

  return flat;
}
