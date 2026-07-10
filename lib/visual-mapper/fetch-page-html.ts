import {
  buildBrowserFetchHeaders,
  fetchWithRateLimitRetry,
  formatProxyRateLimitMessage,
  getCachedPageHtml,
  isRateLimitedStatus,
  setCachedPageHtml,
} from "@/lib/visual-mapper/proxy-fetch";

const FETCH_TIMEOUT_MS = 20_000;

export async function fetchPageHtml(url: string): Promise<string> {
  const cached = getCachedPageHtml(url);
  if (cached) {
    return cached.html;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let pageOrigin = "";
    try {
      pageOrigin = new URL(url).origin + "/";
    } catch {
      pageOrigin = "";
    }

    const response = await fetchWithRateLimitRetry(url, {
      method: "GET",
      headers: buildBrowserFetchHeaders({
        referer: pageOrigin || undefined,
      }),
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      if (isRateLimitedStatus(response.status)) {
        throw new Error(formatProxyRateLimitMessage(response.status));
      }
      throw new Error(
        `Target page returned ${response.status} ${response.statusText}.`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      throw new Error(
        `Target URL did not return HTML (content-type: ${contentType || "unknown"}).`,
      );
    }

    const html = await response.text();
    setCachedPageHtml(url, html, contentType);
    return html;
  } finally {
    clearTimeout(timeout);
  }
}
