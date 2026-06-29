import type { FlatContentBlock } from "@/types/ai-match";
import type { CrawledPage, ContentBlock } from "@/types/crawl";

function toFlatBlock(
  block: ContentBlock,
  page: CrawledPage,
  matchRole?: FlatContentBlock["matchRole"],
): FlatContentBlock {
  return {
    ...block,
    pageUrl: page.url,
    pageTitle: page.title,
    matchRole,
  };
}

/**
 * Expands compound blocks into a section container (heading + intro) plus child
 * blocks. Which Sitecore rendering/template fits each role is resolved from the
 * discovery catalog at match time — not hardcoded here.
 */
export function flattenBlocksForMatching(pages: CrawledPage[]): FlatContentBlock[] {
  const flat: FlatContentBlock[] = [];

  for (const page of pages) {
    for (const block of page.blocks) {
      const subBlocks = block.subBlocks ?? [];

      if (subBlocks.length >= 2) {
        flat.push(
          toFlatBlock(
            {
              ...block,
              subBlocks: undefined,
            },
            page,
            "section-container",
          ),
        );

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
