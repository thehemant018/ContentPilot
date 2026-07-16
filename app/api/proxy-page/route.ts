import { NextRequest, NextResponse } from "next/server";
import { buildBridgeScript } from "@/lib/visual-mapper/bridge-script";
import { injectConsentCleanup } from "@/lib/visual-mapper/consent-cleanup";
import { injectMediaCleanup } from "@/lib/visual-mapper/media-cleanup";
import {
  buildBrowserFetchHeaders,
  fetchWithRateLimitRetry,
  formatProxyRateLimitMessage,
  getCachedPageHtml,
  isRateLimitedStatus,
  setCachedPageHtml,
} from "@/lib/visual-mapper/proxy-fetch";
import {
  injectBridgeScript,
  rewriteRelativeUrls,
} from "@/lib/visual-mapper/url-rewrite";

const FETCH_TIMEOUT_MS = 20_000;

function jsonError(message: string, status = 502): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const urlParam = request.nextUrl.searchParams.get("url");

  if (!urlParam?.trim()) {
    return jsonError("Missing required query parameter: url", 400);
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlParam.trim());
  } catch {
    return jsonError("Invalid URL provided.", 400);
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return jsonError("Only http and https URLs are supported.", 400);
  }

  const cacheKey = targetUrl.toString();
  const cached = getCachedPageHtml(cacheKey);
  if (cached) {
    const proxyOrigin = request.nextUrl.origin;
    const rewritten = rewriteRelativeUrls(cached.html, targetUrl, {
      proxyOrigin,
    });
    const withoutConsent = injectConsentCleanup(rewritten);
    const withoutAutoplayMedia = injectMediaCleanup(withoutConsent);
    const withBridge = injectBridgeScript(
      withoutAutoplayMedia,
      buildBridgeScript(targetUrl.href),
    );

    return new NextResponse(withBridge, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-ContentPilot-Cache": "HIT",
      },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchWithRateLimitRetry(
      targetUrl.toString(),
      {
        method: "GET",
        headers: buildBrowserFetchHeaders({
          referer: targetUrl.origin + "/",
        }),
        signal: controller.signal,
        redirect: "follow",
      },
    );

    if (!response.ok) {
      const status = isRateLimitedStatus(response.status)
        ? response.status
        : 502;
      return jsonError(
        isRateLimitedStatus(response.status)
          ? formatProxyRateLimitMessage(response.status)
          : `Target page returned ${response.status} ${response.statusText}.`,
        status,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      return jsonError(
        `Target URL did not return HTML (content-type: ${contentType || "unknown"}).`,
      );
    }

    const html = await response.text();
    setCachedPageHtml(cacheKey, html, contentType);

    const proxyOrigin = request.nextUrl.origin;
    const rewritten = rewriteRelativeUrls(html, targetUrl, { proxyOrigin });
    const withoutConsent = injectConsentCleanup(rewritten);
    const withoutAutoplayMedia = injectMediaCleanup(withoutConsent);
    const withBridge = injectBridgeScript(
      withoutAutoplayMedia,
      buildBridgeScript(targetUrl.href),
    );

    return new NextResponse(withBridge, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-ContentPilot-Cache": "MISS",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError("Request timed out after 20 seconds.");
    }

    const message =
      error instanceof Error ? error.message : "Failed to fetch target page.";
    return jsonError(message);
  } finally {
    clearTimeout(timeout);
  }
}
