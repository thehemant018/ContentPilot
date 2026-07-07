import { NextRequest, NextResponse } from "next/server";
import {
  extractNextImageInnerUrl,
  normalizeAssetUrlString,
} from "@/lib/visual-mapper/asset-proxy";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MigrateX/1.0)";

function jsonError(message: string, status = 502): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function fetchAsset(
  targetUrl: URL,
  referer: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(targetUrl.toString(), {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "image/*,video/*,audio/*,font/*,*/*;q=0.8",
      Referer: referer,
    },
    signal,
    redirect: "follow",
  });
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
      return jsonError("Asset request timed out after 15 seconds.");
    }

    const message =
      error instanceof Error ? error.message : "Failed to fetch asset.";
    return jsonError(message);
  } finally {
    clearTimeout(timeout);
  }
}
