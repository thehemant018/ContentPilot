import {
  extractBlocksFromHtml,
  extractInternalLinks,
  extractPageTitle,
} from "@/lib/crawl/extract-blocks";
import { extractPageLanguages, aggregateSourceLanguages } from "@/lib/crawl/extract-languages";
import { buildCrawlSuccessMessage } from "@/lib/crawl/crawl-messages";
import { fetchPageHtml } from "@/lib/crawl/fetch-html";
import {
  normalizeCrawlUrl,
  normalizeDiscoveredLink,
  resolveCrawlMaxPages,
} from "@/lib/crawl/url-utils";
import type { CrawlFetchMode, CrawlInput, CrawlResult, CrawledPage } from "@/types/crawl";

function countSubBlocks(pages: CrawledPage[]): number {
  return pages.reduce(
    (total, crawledPage) =>
      total +
      crawledPage.blocks.reduce(
        (sum, block) => sum + (block.subBlocks?.length ?? 0),
        0,
      ),
    0,
  );
}

async function parsePage(
  url: string,
  fetchMode: CrawlFetchMode,
): Promise<{ page: CrawledPage; effectiveFetchMode: CrawlFetchMode }> {
  const { html, fetchMode: effectiveFetchMode } = await fetchPageHtml(
    url,
    fetchMode,
  );
  const title = extractPageTitle(html) || url;
  const blocks = extractBlocksFromHtml(html);
  const { detectedLanguage, availableLanguages, alternateUrls } =
    extractPageLanguages(html, url);

  return {
    page: {
      url,
      title,
      blocks,
      language: detectedLanguage,
      availableLanguages,
      alternateUrls,
    },
    effectiveFetchMode,
  };
}

async function crawlSite(
  startUrl: string,
  maxPages: number,
  fetchMode: CrawlFetchMode,
): Promise<{ pages: CrawledPage[]; effectiveFetchMode: CrawlFetchMode }> {
  const queue = [startUrl];
  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  let effectiveFetchMode: CrawlFetchMode = fetchMode;

  while (queue.length > 0 && pages.length < maxPages) {
    const currentUrl = queue.shift()!;

    if (visited.has(currentUrl)) {
      continue;
    }

    visited.add(currentUrl);

    try {
      const { html, fetchMode: usedMode } = await fetchPageHtml(
        currentUrl,
        fetchMode,
      );
      effectiveFetchMode = usedMode;

      const title = extractPageTitle(html) || currentUrl;
      const blocks = extractBlocksFromHtml(html);
      const { detectedLanguage, availableLanguages, alternateUrls } =
        extractPageLanguages(html, currentUrl);

      pages.push({
        url: currentUrl,
        title,
        blocks,
        language: detectedLanguage,
        availableLanguages,
        alternateUrls,
      });

      if (pages.length < maxPages) {
        const links = extractInternalLinks(
          html,
          startUrl,
          normalizeDiscoveredLink,
        );

        for (const link of links) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
        }
      }
    } catch {
      continue;
    }
  }

  return { pages, effectiveFetchMode };
}

export async function runCrawl(input: CrawlInput): Promise<CrawlResult> {
  const startUrl = normalizeCrawlUrl(input.url);
  const maxPages = resolveCrawlMaxPages(input.maxPages);
  const mode = input.mode === "site" ? "site" : "single";
  const fetchMode = input.fetchMode ?? "browser";

  try {
    if (mode === "site") {
      const { pages, effectiveFetchMode } = await crawlSite(
        startUrl,
        maxPages,
        fetchMode,
      );

      if (pages.length === 0) {
        return {
          success: false,
          message: "No pages could be crawled from the provided URL.",
          mode,
          startUrl,
          fetchMode,
        };
      }

      const blockCount = pages.reduce(
        (total, crawledPage) => total + crawledPage.blocks.length,
        0,
      );

      return {
        success: true,
        message: buildCrawlSuccessMessage({
          mode: "site",
          pageCount: pages.length,
          blockCount,
          subBlockCount: countSubBlocks(pages),
          effectiveFetchMode,
        }),
        mode,
        startUrl,
        fetchMode: effectiveFetchMode,
        pages,
        pageCount: pages.length,
        sourceLanguages: aggregateSourceLanguages(pages),
      };
    }

    const { page, effectiveFetchMode } = await parsePage(startUrl, fetchMode);

    return {
      success: true,
      message: buildCrawlSuccessMessage({
        mode: "single",
        pageCount: 1,
        blockCount: page.blocks.length,
        subBlockCount: countSubBlocks([page]),
        effectiveFetchMode,
      }),
      mode,
      startUrl,
      fetchMode: effectiveFetchMode,
      pages: [page],
      pageCount: 1,
      sourceLanguages: aggregateSourceLanguages([page]),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Crawl request failed.";

    return {
      success: false,
      message,
      mode,
      startUrl,
      fetchMode,
    };
  }
}
