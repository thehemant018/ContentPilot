import { NextRequest, NextResponse } from "next/server";
import { buildBridgeScript } from "@/lib/visual-mapper/bridge-script";
import { injectConsentCleanup } from "@/lib/visual-mapper/consent-cleanup";
import { injectMediaCleanup } from "@/lib/visual-mapper/media-cleanup";
import {
  injectBridgeScript,
  rewriteRelativeUrls,
} from "@/lib/visual-mapper/url-rewrite";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MigrateX/1.0)";

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      return jsonError(
        `Target page returned ${response.status} ${response.statusText}.`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return jsonError(
        `Target URL did not return HTML (content-type: ${contentType || "unknown"}).`,
      );
    }

    const html = await response.text();
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
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError("Request timed out after 10 seconds.");
    }

    const message =
      error instanceof Error ? error.message : "Failed to fetch target page.";
    return jsonError(message);
  } finally {
    clearTimeout(timeout);
  }
}
