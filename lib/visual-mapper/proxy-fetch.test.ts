import { describe, expect, it, beforeEach } from "vitest";
import {
  buildBrowserFetchHeaders,
  clearProxyPageCache,
  formatProxyRateLimitMessage,
  getCachedPageHtml,
  parseRetryAfterMs,
  setCachedPageHtml,
} from "@/lib/visual-mapper/proxy-fetch";

describe("parseRetryAfterMs", () => {
  it("parses retry-after seconds", () => {
    expect(parseRetryAfterMs("2", 1000)).toBe(2000);
  });

  it("falls back when header is missing", () => {
    expect(parseRetryAfterMs(null, 1500)).toBe(1500);
  });
});

describe("buildBrowserFetchHeaders", () => {
  it("uses a browser-like user agent", () => {
    const headers = buildBrowserFetchHeaders({ referer: "https://example.com" });
    expect(headers).toMatchObject({
      "User-Agent": expect.stringContaining("Chrome/"),
      Referer: "https://example.com",
    });
  });
});

describe("proxy page cache", () => {
  beforeEach(() => {
    clearProxyPageCache();
  });

  it("stores and returns cached html", () => {
    setCachedPageHtml(
      "https://example.com/page",
      "<html></html>",
      "text/html",
      60_000,
    );
    expect(getCachedPageHtml("https://example.com/page")?.html).toBe(
      "<html></html>",
    );
  });
});

describe("formatProxyRateLimitMessage", () => {
  it("explains 429 clearly", () => {
    expect(formatProxyRateLimitMessage(429)).toContain("429");
  });
});
