import { NextRequest, NextResponse } from "next/server";
import {
  extractNextImageInnerUrl,
  normalizeAssetUrlString,
} from "@/lib/visual-mapper/asset-proxy";
import {
  buildBrowserFetchHeaders,
  fetchWithRateLimitRetry,
  formatProxyRateLimitMessage,
  isRateLimitedStatus,
} from "@/lib/visual-mapper/proxy-fetch";

const FETCH_TIMEOUT_MS = 20_000;

function jsonError(message: string, status = 502): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function fetchAsset(
  targetUrl: URL,
  referer: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetchWithRateLimitRetry(
    targetUrl.toString(),
    {
      method: "GET",
      headers: buildBrowserFetchHeaders({
        accept: "image/*,video/*,audio/*,font/*,*/*;q=0.8",
        referer,
      }),
      signal,
      redirect: "follow",
    },
    {
      // Assets can burst; keep retries shorter than page fetches.
      maxRetries: 2,
      initialDelayMs: 750,
    },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const urlParam = request.nextUrl.searchParams.get("url");
  const refererParam = request.nextUrl.searchParams.get("referer");

  if (!urlParam?.trim()) {
    return jsonError("Missing required query parameter: url", 400);
  }

  const normalizedUrl = normalizeAssetUrlString(urlParam.trim());

  let targetUrl: URL;
  try {
    targetUrl = new URL(normalizedUrl);
  } catch {
    return jsonError("Invalid URL provided.", 400);
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return jsonError("Only http and https URLs are supported.", 400);
  }

  const referer =
    refererParam?.trim() ||
    request.headers.get("referer") ||
    targetUrl.origin;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let response = await fetchAsset(targetUrl, referer, controller.signal);

    if (!response.ok) {
      let pageBase: URL;
      try {
        pageBase = refererParam
          ? new URL(refererParam)
          : new URL(targetUrl.origin);
      } catch {
        pageBase = new URL(targetUrl.origin);
      }
      const fallback = extractNextImageInnerUrl(targetUrl.href, pageBase);
      if (fallback && fallback !== targetUrl.href) {
        const fallbackUrl = new URL(fallback);
        response = await fetchAsset(fallbackUrl, referer, controller.signal);
        if (response.ok) {
          targetUrl = fallbackUrl;
        }
      }
    }

    if (!response.ok) {
      if (isRateLimitedStatus(response.status)) {
        return jsonError(
          formatProxyRateLimitMessage(response.status),
          response.status,
        );
      }
      return jsonError(
        `Asset returned ${response.status} ${response.statusText}.`,
        response.status === 404 ? 404 : 502,
      );
    }

    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError("Asset request timed out after 20 seconds.");
    }

    const message =
      error instanceof Error ? error.message : "Failed to fetch asset.";
    return jsonError(message);
  } finally {
    clearTimeout(timeout);
  }
}
