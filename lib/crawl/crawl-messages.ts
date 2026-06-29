import type { CrawlFetchMode } from "@/types/crawl";

const BROWSER_INSTALL_HINT =
  "Run npx playwright install chromium to enable browser rendering for JavaScript-heavy sites.";

export function sanitizeBrowserWarning(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/executable doesn't exist|browserType\.launch|ms-playwright/i.test(raw)) {
    return BROWSER_INSTALL_HINT;
  }

  if (/playwright/i.test(raw)) {
    return "Browser render was unavailable; static HTML was used instead.";
  }

  return "Browser render was unavailable; static HTML was used instead.";
}

export function buildCrawlSuccessMessage(options: {
  mode: "single" | "site";
  pageCount: number;
  blockCount: number;
  subBlockCount: number;
  effectiveFetchMode: CrawlFetchMode;
}): string {
  const { mode, pageCount, blockCount, subBlockCount, effectiveFetchMode } =
    options;

  const subBlockSuffix =
    subBlockCount > 0 ? ` (${subBlockCount} sub-blocks)` : "";
  const renderSuffix =
    effectiveFetchMode === "browser" ? " using browser render" : "";

  if (mode === "site") {
    return `Crawled ${pageCount} page(s) and found ${blockCount} content block(s)${subBlockSuffix}${renderSuffix}.`;
  }

  return `Parsed 1 page and found ${blockCount} content block(s)${subBlockSuffix}${renderSuffix}.`;
}
