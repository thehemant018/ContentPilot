import { describe, expect, it } from "vitest";
import {
  extractNextImageInnerUrl,
  normalizeAssetUrlString,
  resolveImageAssetUrl,
  rewriteReactImageAttributes,
  rewriteSrcset,
  toProxiedAssetUrl,
} from "@/lib/visual-mapper/asset-proxy";
import { rewriteRelativeUrls } from "@/lib/visual-mapper/url-rewrite";

const PROXY_ORIGIN = "http://localhost:3000";
const PAGE_REFERER = "https://www.seismic.com/platform/overview/";

describe("asset-proxy", () => {
  const base = new URL(PAGE_REFERER);

  it("decodes HTML entities in Next.js image URLs", () => {
    const raw =
      "https://www.seismic.com/_next/image/?url=https%3A%2F%2Fassets.seismic.com%2Fapi%2Fpublic%2Fcontent%2F58159-logo-seismic-pos%3Fv%3D4e6e9b3f&amp;w=128&amp;q=75";
    const inner = extractNextImageInnerUrl(raw, base);
    expect(inner).toBe(
      "https://assets.seismic.com/api/public/content/58159-logo-seismic-pos?v=4e6e9b3f",
    );
  });

  it("normalizes /_next/image/? to /_next/image?", () => {
    expect(normalizeAssetUrlString("/_next/image/?url=%2Fhero.jpg")).toBe(
      "/_next/image?url=%2Fhero.jpg",
    );
  });

  it("proxies inner asset URL with referer param", () => {
    const proxied = resolveImageAssetUrl(
      "/_next/image?url=https%3A%2F%2Fassets.seismic.com%2Fapi%2Fpublic%2Fcontent%2F58159-logo-seismic-pos%3Fv%3D4e6e9b3f&amp;w=128&amp;q=75",
      base,
      PROXY_ORIGIN,
      PAGE_REFERER,
    );
    expect(proxied).toContain(`${PROXY_ORIGIN}/api/proxy-asset?`);
    expect(proxied).toContain("referer=");
    expect(proxied).toContain(encodeURIComponent("assets.seismic.com"));
    expect(proxied).not.toContain("_next%2Fimage");
  });

  it("rewrites React imageSrcSet preload attributes", () => {
    const html = rewriteReactImageAttributes(
      '<link rel="preload" as="image" imageSrcSet="/_next/image/?url=https%3A%2F%2Fassets.seismic.com%2Fapi%2Fpublic%2Fcontent%2F62890-image-platform-overview-hero%3Fv%3D1fd40e11&amp;w=1200&amp;q=75 1x, /_next/image/?url=https%3A%2F%2Fassets.seismic.com%2Fapi%2Fpublic%2Fcontent%2F62890-image-platform-overview-hero%3Fv%3D1fd40e11&amp;w=3840&amp;q=75 2x">',
      base,
      PROXY_ORIGIN,
      PAGE_REFERER,
    );
    expect(html).toContain(`${PROXY_ORIGIN}/api/proxy-asset?url=`);
    expect(html).not.toContain('imageSrcSet="/_next/image');
  });
});

describe("url-rewrite", () => {
  const base = new URL("https://www.dpworld.com/en");

  it("rewrites img src through asset proxy", () => {
    const html = rewriteRelativeUrls(
      '<html><head></head><body><img src="/hero.jpg" srcset="/hero-2x.jpg 2x"></body></html>',
      base,
      { proxyOrigin: PROXY_ORIGIN },
    );
    expect(html).toContain(`${PROXY_ORIGIN}/api/proxy-asset?url=`);
    expect(html).toContain('id="contentpilot-asset-runtime"');
  });

  it("injects runtime asset rewriter in head", () => {
    const html = rewriteRelativeUrls("<html><head></head><body></body></html>", base, {
      proxyOrigin: PROXY_ORIGIN,
    });
    expect(html).toContain("function toProxy(url)");
    expect(html).toContain("MutationObserver");
  });

  it("does not proxy script src", () => {
    const html = rewriteRelativeUrls(
      '<script src="/_next/static/chunks/main.js"></script>',
      base,
      { proxyOrigin: PROXY_ORIGIN },
    );
    expect(html).toContain(
      'src="https://www.dpworld.com/_next/static/chunks/main.js"',
    );
    expect(html).not.toMatch(/proxy-asset\?url=.*main\.js/);
  });

  it("rewrites srcset with absolute proxy URLs", () => {
    const srcset = rewriteSrcset("/img/a.jpg 1x, /img/b.jpg 2x", base, PROXY_ORIGIN);
    expect(srcset).toContain(`${PROXY_ORIGIN}/api/proxy-asset?url=`);
  });

  it("toProxiedAssetUrl avoids double wrap", () => {
    const proxied = toProxiedAssetUrl(
      "https://dpw-p-001.sitecorecontenthub.cloud/api/public/content/abc.png",
      PROXY_ORIGIN,
    );
    expect(toProxiedAssetUrl(proxied, PROXY_ORIGIN)).toBe(proxied);
  });

  it("rewrites iframe embed src to absolute URLs without asset proxy", () => {
    const html = rewriteRelativeUrls(
      '<iframe src="/embed/video/123"></iframe><iframe src="https://www.youtube.com/embed/abc"></iframe>',
      base,
      { proxyOrigin: PROXY_ORIGIN },
    );
    expect(html).toContain('src="https://www.dpworld.com/embed/video/123"');
    expect(html).toContain('src="https://www.youtube.com/embed/abc"');
    expect(html).not.toContain("proxy-asset?url=https%3A%2F%2Fwww.youtube.com");
  });

  it("adds allow permissions for known video embed hosts", () => {
    const html = rewriteRelativeUrls(
      '<iframe src="https://player.vimeo.com/video/123"></iframe>',
      base,
      { proxyOrigin: PROXY_ORIGIN },
    );
    expect(html).toContain('allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"');
  });

  it("rewrites anchor href through the page proxy for in-iframe navigation", () => {
    const html = rewriteRelativeUrls(
      '<a href="/about">About</a><a href="https://external.com/page">External</a><a href="#faq">FAQ</a>',
      base,
      { proxyOrigin: PROXY_ORIGIN },
    );
    expect(html).toContain(
      `${PROXY_ORIGIN}/api/proxy-page?url=${encodeURIComponent("https://www.dpworld.com/about")}`,
    );
    expect(html).toContain(
      `${PROXY_ORIGIN}/api/proxy-page?url=${encodeURIComponent("https://external.com/page")}`,
    );
    expect(html).toContain('href="#faq"');
  });
});
