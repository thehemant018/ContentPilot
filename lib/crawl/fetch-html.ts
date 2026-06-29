import { fetchRenderedHtml } from "@/lib/crawl/browser-fetch";
import type { CrawlFetchMode } from "@/types/crawl";

const FETCH_TIMEOUT_MS = 30_000;

export interface FetchHtmlResult {
  html: string;
  fetchMode: CrawlFetchMode;
}

async function fetchStaticHtml(url: string): Promise<string> {
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

export async function fetchPageHtml(
  url: string,
  fetchMode: CrawlFetchMode = "browser",
): Promise<FetchHtmlResult> {
  if (fetchMode === "static") {
    return {
      html: await fetchStaticHtml(url),
      fetchMode: "static",
    };
  }

  const browserResult = await fetchRenderedHtml(url);
  if (browserResult.rendered && browserResult.html) {
    return {
      html: browserResult.html,
      fetchMode: "browser",
    };
  }

  const staticHtml = await fetchStaticHtml(url);

  return {
    html: staticHtml,
    fetchMode: "static",
  };
}
