/**
 * Rewrites relative URLs in HTML to absolute and routes images through the asset proxy.
 */

import {
  extractNextImageInnerUrl,
  injectAssetRuntime,
  isProxiedAssetPath,
  resolveImageAssetUrl,
  resolveUrl,
  rewriteReactImageAttributes,
  rewriteSrcset,
  shouldProxyCssUrl,
  toProxiedAssetUrl,
} from "@/lib/visual-mapper/asset-proxy";

export interface RewriteOptions {
  proxyOrigin: string;
}

export {
  extractNextImageInnerUrl,
  injectAssetRuntime,
  isProxiedAssetPath,
  resolveImageAssetUrl,
  resolveUrl,
  rewriteSrcset,
  toProxiedAssetUrl,
};

/** @deprecated Use extractNextImageInnerUrl — kept for tests. */
export function unwrapNextImageUrl(absoluteUrl: string, baseUrl: URL): string {
  return extractNextImageInnerUrl(absoluteUrl, baseUrl) ?? absoluteUrl;
}

const EMBED_HOST_PATTERN =
  /youtube\.com|youtu\.be|vimeo\.com|player\.vimeo|wistia\.com|vidyard\.com|dailymotion\.com|facebook\.com\/plugins\/video/i;

const DEFAULT_EMBED_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

function rewriteGenericUrl(url: string, baseUrl: URL): string {
  return resolveUrl(url, baseUrl);
}

function rewriteTagAttributes(
  html: string,
  tagName: string,
  attrNames: string[],
  rewrite: (url: string) => string,
): string {
  let result = html;
  for (const attr of attrNames) {
    const pattern = new RegExp(
      `(<${tagName}\\b[^>]*?\\s${attr}\\s*=\\s*)(["'])([^"']+)\\2`,
      "gi",
    );
    result = result.replace(
      pattern,
      (_match, prefix: string, quote: string, url: string) =>
        `${prefix}${quote}${rewrite(url)}${quote}`,
    );
  }
  return result;
}

export function ensureIframeEmbedCapabilities(html: string): string {
  return html.replace(/<iframe\b([^>]*)>/gi, (match, attrs: string) => {
    const srcMatch = attrs.match(
      /\s(?:src|data-src|data-lazy-src|data-iframe-src)\s*=\s*["']([^"']+)["']/i,
    );
    if (!srcMatch || !EMBED_HOST_PATTERN.test(srcMatch[1])) {
      return match;
    }
    if (/\ballow\s*=/i.test(attrs)) {
      return match;
    }
    return `<iframe${attrs} allow="${DEFAULT_EMBED_ALLOW}">`;
  });
}

export function rewriteRelativeUrls(
  html: string,
  baseUrl: URL,
  options: RewriteOptions,
): string {
  const { proxyOrigin } = options;
  const pageReferer = baseUrl.href;
  let result = html;

  result = rewriteReactImageAttributes(
    result,
    baseUrl,
    proxyOrigin,
    pageReferer,
  );

  const mediaTags = ["img", "source", "video", "audio", "picture"];
  for (const tag of mediaTags) {
    result = rewriteTagAttributes(
      result,
      tag,
      ["src", "data-src", "data-original", "data-lazy-src", "poster"],
      (url) => resolveImageAssetUrl(url, baseUrl, proxyOrigin, pageReferer),
    );
    result = rewriteTagAttributes(
      result,
      tag,
      ["srcset", "data-srcset"],
      (url) => rewriteSrcset(url, baseUrl, proxyOrigin, pageReferer),
    );
  }

  result = result.replace(
    /(<link\b[^>]*\brel=["']preload["'][^>]*\bas=["']image["'][^>]*\bhref=["'])([^"']+)(["'])/gi,
    (_match, prefix: string, url: string, suffix: string) =>
      `${prefix}${resolveImageAssetUrl(url, baseUrl, proxyOrigin, pageReferer)}${suffix}`,
  );

  result = result.replace(
    /(<link\b[^>]*\bas=["']image["'][^>]*\brel=["']preload["'][^>]*\bhref=["'])([^"']+)(["'])/gi,
    (_match, prefix: string, url: string, suffix: string) =>
      `${prefix}${resolveImageAssetUrl(url, baseUrl, proxyOrigin, pageReferer)}${suffix}`,
  );

  result = rewriteTagAttributes(result, "link", ["href"], (url) =>
    rewriteGenericUrl(url, baseUrl),
  );

  result = rewriteTagAttributes(result, "script", ["src"], (url) =>
    rewriteGenericUrl(url, baseUrl),
  );

  result = rewriteTagAttributes(result, "a", ["href"], (url) =>
    rewriteGenericUrl(url, baseUrl),
  );

  result = rewriteTagAttributes(result, "form", ["action"], (url) =>
    rewriteGenericUrl(url, baseUrl),
  );

  const iframeAttrs = [
    "src",
    "data-src",
    "data-lazy-src",
    "data-iframe-src",
    "data-original",
  ];
  result = rewriteTagAttributes(result, "iframe", iframeAttrs, (url) =>
    rewriteGenericUrl(url, baseUrl),
  );
  result = ensureIframeEmbedCapabilities(result);

  result = result.replace(
    /url\s*\(\s*(["']?)([^"')]+)\1\s*\)/gi,
    (_match, quote: string, url: string) => {
      const trimmed = url.trim();
      const resolved = resolveUrl(trimmed, baseUrl);
      const finalUrl = shouldProxyCssUrl(resolved)
        ? toProxiedAssetUrl(resolved, proxyOrigin, pageReferer)
        : resolved;
      return `url(${quote}${finalUrl}${quote})`;
    },
  );

  result = result.replace(/<base\b[^>]*>/gi, "");

  result = result.replace(
    /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
    "",
  );

  result = result.replace(
    /<meta[^>]+http-equiv=["']Content-Security-Policy-Report-Only["'][^>]*>/gi,
    "",
  );

  const headInject = `<meta name="referrer" content="no-referrer">`;
  if (/<head[^>]*>/i.test(result)) {
    result = result.replace(/<head[^>]*>/i, (match) => `${match}${headInject}`);
  } else if (/<html[^>]*>/i.test(result)) {
    result = result.replace(
      /<html[^>]*>/i,
      (match) => `${match}<head>${headInject}</head>`,
    );
  } else {
    result = `${headInject}${result}`;
  }

  result = injectAssetRuntime(result, proxyOrigin, pageReferer);

  return result;
}

export function injectBridgeScript(html: string, script: string): string {
  const tag = `<script>${script}</script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${tag}</body>`);
  }
  return `${html}${tag}`;
}
