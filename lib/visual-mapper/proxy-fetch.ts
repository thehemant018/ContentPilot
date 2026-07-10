/** Shared fetch helpers for Visual Mapper proxy routes (429-aware). */

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const PROXY_FETCH_MAX_RETRIES = 3;
export const PROXY_FETCH_INITIAL_DELAY_MS = 1_000;
export const PROXY_PAGE_CACHE_TTL_MS = 60_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRateLimitedStatus(status: number): boolean {
  return status === 429 || status === 503;
}

export function parseRetryAfterMs(
  headerValue: string | null,
  fallbackMs: number,
): number {
  if (!headerValue?.trim()) {
    return fallbackMs;
  }

  const asSeconds = Number.parseInt(headerValue.trim(), 10);
  if (!Number.isNaN(asSeconds) && asSeconds >= 0) {
    return Math.min(Math.max(asSeconds * 1000, fallbackMs), 30_000);
  }

  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    if (delta > 0) {
      return Math.min(Math.max(delta, fallbackMs), 30_000);
    }
  }

  return fallbackMs;
}

export function buildBrowserFetchHeaders(input?: {
  accept?: string;
  referer?: string;
  extra?: HeadersInit;
}): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_USER_AGENT,
    Accept:
      input?.accept ??
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };

  if (input?.referer?.trim()) {
    headers.Referer = input.referer.trim();
  }

  if (input?.extra) {
    const extra = new Headers(input.extra);
    extra.forEach((value, key) => {
      headers[key] = value;
    });
  }

  return headers;
}

export async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  options?: {
    maxRetries?: number;
    initialDelayMs?: number;
  },
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? PROXY_FETCH_MAX_RETRIES;
  const initialDelayMs =
    options?.initialDelayMs ?? PROXY_FETCH_INITIAL_DELAY_MS;

  let delayMs = initialDelayMs;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, init);
    lastResponse = response;

    if (!isRateLimitedStatus(response.status) || attempt === maxRetries) {
      return response;
    }

    const retryAfter = parseRetryAfterMs(
      response.headers.get("retry-after"),
      delayMs,
    );
    await sleep(retryAfter);
    delayMs = Math.min(delayMs * 2, 15_000);
  }

  return lastResponse!;
}

interface CachedHtmlEntry {
  html: string;
  contentType: string;
  expiresAt: number;
}

const pageHtmlCache = new Map<string, CachedHtmlEntry>();

export function getCachedPageHtml(url: string): CachedHtmlEntry | null {
  const entry = pageHtmlCache.get(url);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    pageHtmlCache.delete(url);
    return null;
  }
  return entry;
}

export function setCachedPageHtml(
  url: string,
  html: string,
  contentType: string,
  ttlMs = PROXY_PAGE_CACHE_TTL_MS,
): void {
  pageHtmlCache.set(url, {
    html,
    contentType,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearProxyPageCache(): void {
  pageHtmlCache.clear();
}

export function formatProxyRateLimitMessage(status: number): string {
  if (status === 429) {
    return "The target site rate-limited this request (HTTP 429). Wait a moment and try again, or reload the page.";
  }
  if (status === 503) {
    return "The target site is temporarily unavailable (HTTP 503). Wait a moment and try again.";
  }
  return `Target page returned ${status}.`;
}
