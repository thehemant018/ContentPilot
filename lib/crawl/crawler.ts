import {
  extractBlocksFromHtml,
  extractInternalLinks,
  extractPageTitle,
} from "@/lib/crawl/extract-blocks";
import {
  normalizeCrawlUrl,
  normalizeDiscoveredLink,
  resolveCrawlMaxPages,
} from "@/lib/crawl/url-utils";
import type { CrawlInput, CrawlResult, CrawledPage } from "@/types/crawl";

const FETCH_TIMEOUT_MS = 30_000;

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "MigrateX/1.0 (content migration crawler)",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml")
  ) {
    throw new Error(`URL did not return HTML content: ${url}`);
  }

  return response.text();
}

async function parsePage(url: string): Promise<CrawledPage> {
  const html = await fetchHtml(url);
  const title = extractPageTitle(html) || url;
  const blocks = extractBlocksFromHtml(html);

  return {
    url,
    title,
    blocks,
  };
}

async function crawlSite(
  startUrl: string,
  maxPages: number,
): Promise<CrawledPage[]> {
  const queue = [startUrl];
  const visited = new Set<string>();
  const pages: CrawledPage[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const currentUrl = queue.shift()!;

    if (visited.has(currentUrl)) {
      continue;
    }

    visited.add(currentUrl);

    try {
      const html = await fetchHtml(currentUrl);
      const title = extractPageTitle(html) || currentUrl;
      const blocks = extractBlocksFromHtml(html);

      pages.push({
        url: currentUrl,
        title,
        blocks,
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

  return pages;
}

export async function runCrawl(input: CrawlInput): Promise<CrawlResult> {
  const startUrl = normalizeCrawlUrl(input.url);
  const maxPages = resolveCrawlMaxPages(input.maxPages);
  const mode = input.mode === "site" ? "site" : "single";

  try {
    const pages =
      mode === "site"
        ? await crawlSite(startUrl, maxPages)
        : [await parsePage(startUrl)];

    if (pages.length === 0) {
      return {
        success: false,
        message: "No pages could be crawled from the provided URL.",
        mode,
        startUrl,
      };
    }

    const blockCount = pages.reduce(
      (total, crawledPage) => total + crawledPage.blocks.length,
      0,
    );

    return {
      success: true,
      message:
        mode === "site"
          ? `Crawled ${pages.length} page(s) and found ${blockCount} content block(s).`
          : `Parsed 1 page and found ${blockCount} content block(s).`,
      mode,
      startUrl,
      pages,
      pageCount: pages.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Crawl request failed.";

    return {
      success: false,
      message,
      mode,
      startUrl,
    };
  }
}
