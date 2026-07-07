/**
 * Shared helpers for static HTML rewrite and runtime asset proxying.
 */

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function normalizeAssetUrlString(raw: string): string {
  let result = decodeHtmlEntities(raw.trim());
  result = result.replace(/\/_next\/image\/\?/gi, "/_next/image?");
  return result;
}

export function isProxiedAssetPath(value: string): boolean {
  return (
    value.includes("/api/proxy-asset?") || value.includes("/api/proxy-asset&")
  );
}

export function isNextImagePath(pathname: string): boolean {
  return /\/_next\/image\/?$/i.test(pathname);
}

/** Extract the underlying asset URL from a Next.js image optimizer URL. */
export function extractNextImageInnerUrl(
  optimizerUrl: string,
  baseUrl: URL,
): string | null {
  try {
    const normalized = normalizeAssetUrlString(optimizerUrl);
    const absolute = resolveUrl(normalized, baseUrl);
    const parsed = new URL(absolute);
    if (!isNextImagePath(parsed.pathname)) {
      return null;
    }
    const inner = parsed.searchParams.get("url");
    if (!inner) {
      return null;
    }
    const decoded = decodeURIComponent(inner);
    return resolveUrl(normalizeAssetUrlString(decoded), parsed);
  } catch {
    return null;
  }
}

const SKIP_SCHEMES = /^(data:|mailto:|tel:|#|javascript:|blob:)/i;

export function resolveUrl(raw: string, baseUrl: URL): string {
  const trimmed = normalizeAssetUrlString(raw);
  if (!trimmed || SKIP_SCHEMES.test(trimmed)) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `${baseUrl.protocol}${trimmed}`;
  }
  if (isProxiedAssetPath(trimmed)) {
    return trimmed;
  }
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return trimmed;
  }
}

export function toProxiedAssetUrl(
  absoluteUrl: string,
  proxyOrigin: string,
  pageReferer?: string,
): string {
  const normalized = normalizeAssetUrlString(absoluteUrl);
  if (!/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  if (isProxiedAssetPath(normalized)) {
    return normalized;
  }
  const origin = proxyOrigin.replace(/\/$/, "");
  const params = new URLSearchParams({ url: normalized });
  if (pageReferer) {
    params.set("referer", pageReferer);
  }
  return `${origin}/api/proxy-asset?${params.toString()}`;
}

export function resolveImageAssetUrl(
  url: string,
  baseUrl: URL,
  proxyOrigin: string,
  pageReferer?: string,
): string {
  const resolved = resolveUrl(url, baseUrl);

  const inner = extractNextImageInnerUrl(resolved, baseUrl);
  if (inner && /^https?:\/\//i.test(inner)) {
    return toProxiedAssetUrl(inner, proxyOrigin, pageReferer);
  }

  try {
    const parsed = new URL(resolved, baseUrl);
    if (isNextImagePath(parsed.pathname)) {
      return toProxiedAssetUrl(parsed.href, proxyOrigin, pageReferer);
    }
  } catch {
    // ignore
  }

  if (/^https?:\/\//i.test(resolved)) {
    return toProxiedAssetUrl(resolved, proxyOrigin, pageReferer);
  }
  return resolved;
}

export function rewriteSrcsetValue(
  value: string,
  baseUrl: URL,
  proxyOrigin: string,
  pageReferer?: string,
): string {
  return rewriteSrcset(value, baseUrl, proxyOrigin, pageReferer);
}

/** Rewrite React/Next.js image attrs (imageSrcSet, imageSrc) on any HTML tag. */
export function rewriteReactImageAttributes(
  html: string,
  baseUrl: URL,
  proxyOrigin: string,
  pageReferer?: string,
): string {
  let result = html;

  result = result.replace(
    /(\bimageSrcSet\s*=\s*)(["'])([^"']+)\2/gi,
    (_match, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${rewriteSrcset(value, baseUrl, proxyOrigin, pageReferer)}${quote}`,
  );

  result = result.replace(
    /(\bimageSrc\s*=\s*)(["'])([^"']+)\2/gi,
    (_match, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${resolveImageAssetUrl(value, baseUrl, proxyOrigin, pageReferer)}${quote}`,
  );

  return result;
}

export function rewriteSrcset(
  value: string,
  baseUrl: URL,
  proxyOrigin: string,
  pageReferer?: string,
): string {
  return value
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) {
        return trimmed;
      }
      const tokens = trimmed.split(/\s+/);
      const resolved = resolveImageAssetUrl(
        tokens[0] ?? "",
        baseUrl,
        proxyOrigin,
        pageReferer,
      );
      if (tokens.length <= 1) {
        return resolved;
      }
      return `${resolved} ${tokens.slice(1).join(" ")}`;
    })
    .join(", ");
}

function shouldProxyCssUrl(resolvedUrl: string): boolean {
  if (!/^https?:\/\//i.test(resolvedUrl)) {
    return false;
  }
  if (
    /\.(avif|gif|jpe?g|png|svg|webp|ico|woff2?|ttf|otf|eot|mp4|webm|ogg)(\?|#|$)/i.test(
      resolvedUrl,
    )
  ) {
    return true;
  }
  if (/\/_next\/image(\?|\/|$)/i.test(resolvedUrl)) {
    return true;
  }
  if (
    /\/images?\//i.test(resolvedUrl) ||
    /sitecorecontenthub/i.test(resolvedUrl) ||
    /assets\.seismic\.com/i.test(resolvedUrl)
  ) {
    return true;
  }
  return false;
}

export function buildAssetRuntimeScript(
  proxyOrigin: string,
  pageReferer: string,
): string {
  return `
(function() {
  var PROXY_ORIGIN = ${JSON.stringify(proxyOrigin.replace(/\/$/, ""))};
  var PAGE_REFERER = ${JSON.stringify(pageReferer)};
  var ASSET_ATTRS = ["src", "srcset", "imagesrc", "imagesrcset", "data-src", "data-srcset", "data-original", "data-lazy-src", "poster"];

  function isAssetAttr(name) {
    var lower = String(name || "").toLowerCase();
    return ASSET_ATTRS.indexOf(lower) !== -1;
  }

  function isImagePreloadLink(el) {
    return el
      && el.tagName
      && el.tagName.toLowerCase() === "link"
      && el.getAttribute("rel") === "preload"
      && el.getAttribute("as") === "image";
  }

  function rewriteAttrValue(name, value) {
    var lower = String(name || "").toLowerCase();
    if (lower.indexOf("srcset") !== -1) return rewriteSrcset(value);
    if (lower === "src" || lower === "imagesrc" || lower === "poster") return toProxy(value);
    if (lower.indexOf("data-src") !== -1 || lower === "data-original" || lower === "data-lazy-src") return toProxy(value);
    return value;
  }

  function decodeEntities(value) {
    return String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  function normalizeUrl(raw) {
    return decodeEntities(String(raw || "").trim()).replace(/\\/_next\\/image\\/\\?/gi, "/_next/image?");
  }

  function isProxied(url) {
    return url.indexOf("/api/proxy-asset?") !== -1;
  }

  function isSkippable(url) {
    return !url || /^(data:|blob:|#|javascript:|mailto:)/i.test(url) || isProxied(url);
  }

  function extractNextInner(url) {
    try {
      var normalized = normalizeUrl(url);
      var parsed = new URL(normalized, PAGE_REFERER);
      if (!/\\/_next\\/image\\/?$/i.test(parsed.pathname)) return null;
      var inner = parsed.searchParams.get("url");
      if (!inner) return null;
      return new URL(decodeURIComponent(inner), parsed).href;
    } catch (err) {
      return null;
    }
  }

  function toProxy(url) {
    var normalized = normalizeUrl(url);
    if (isSkippable(normalized)) return normalized;
    var absolute = normalized;
    try {
      absolute = new URL(normalized, PAGE_REFERER).href;
    } catch (err) {
      return normalized;
    }
    if (!/^https?:/i.test(absolute)) return normalized;
    var inner = extractNextInner(absolute);
    var target = inner || absolute;
    if (isProxied(target)) return target;
    var params = "url=" + encodeURIComponent(target) + "&referer=" + encodeURIComponent(PAGE_REFERER);
    return PROXY_ORIGIN + "/api/proxy-asset?" + params;
  }

  function toAbsolute(url) {
    var normalized = normalizeUrl(url);
    if (isSkippable(normalized)) return normalized;
    try {
      return new URL(normalized, PAGE_REFERER).href;
    } catch (err) {
      return normalized;
    }
  }

  var IFRAME_URL_ATTRS = ["src", "data-src", "data-lazy-src", "data-iframe-src", "data-original"];

  function isIframeUrlAttr(name) {
    return IFRAME_URL_ATTRS.indexOf(String(name || "").toLowerCase()) !== -1;
  }

  function rewriteIframeAttrValue(name, value) {
    return isIframeUrlAttr(name) ? toAbsolute(value) : value;
  }

  function rewriteSrcset(value) {
    return String(value || "").split(",").map(function(part) {
      var trimmed = part.trim();
      if (!trimmed) return trimmed;
      var tokens = trimmed.split(/\\s+/);
      tokens[0] = toProxy(tokens[0]);
      return tokens.join(" ");
    }).join(", ");
  }

  function rewriteElement(el) {
    if (!el || el.nodeType !== 1) return;
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "img" || tag === "source" || tag === "video" || tag === "audio" || tag === "picture") {
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (!attr || !isAssetAttr(attr.name)) continue;
        var current = attr.value;
        var next = rewriteAttrValue(attr.name, current);
        if (next !== current) el.setAttribute(attr.name, next);
      }
      if (tag === "img") {
        try {
          if (el.src && !isProxied(el.src) && /\\/_next\\/image/i.test(el.src)) {
            el.src = toProxy(el.src);
          }
          if (el.srcset && !isProxied(el.srcset) && /\\/_next\\/image/i.test(el.srcset)) {
            el.srcset = rewriteSrcset(el.srcset);
          }
        } catch (err) {}
      }
      if (tag === "video" || tag === "audio") {
        try {
          if (el.src && !isProxied(el.src)) {
            el.src = toProxy(el.src);
          }
        } catch (err) {}
      }
    }
    if (tag === "iframe") {
      for (var k = 0; k < el.attributes.length; k++) {
        var iframeAttr = el.attributes[k];
        if (!iframeAttr || !isIframeUrlAttr(iframeAttr.name)) continue;
        var iframeCurrent = iframeAttr.value;
        var iframeNext = rewriteIframeAttrValue(iframeAttr.name, iframeCurrent);
        if (iframeNext !== iframeCurrent) el.setAttribute(iframeAttr.name, iframeNext);
      }
    }
    if (isImagePreloadLink(el)) {
      var href = el.getAttribute("href");
      if (href) el.setAttribute("href", toProxy(href));
      for (var j = 0; j < el.attributes.length; j++) {
        var preloadAttr = el.attributes[j];
        if (!preloadAttr) continue;
        var preloadName = preloadAttr.name.toLowerCase();
        if (preloadName === "imagesrcset" || preloadName === "imagesrc") {
          var preloadValue = preloadAttr.value;
          var preloadNext = preloadName.indexOf("srcset") !== -1
            ? rewriteSrcset(preloadValue)
            : toProxy(preloadValue);
          if (preloadNext !== preloadValue) el.setAttribute(preloadAttr.name, preloadNext);
        }
      }
    }
  }

  function patchDomSetters() {
    var origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      var lower = String(name || "").toLowerCase();
      var tag = this.tagName ? this.tagName.toLowerCase() : "";
      if (lower === "href" && !isImagePreloadLink(this)) {
        return origSetAttribute.call(this, name, value);
      }
      if (tag === "iframe" && isIframeUrlAttr(name)) {
        value = rewriteIframeAttrValue(name, value);
        return origSetAttribute.call(this, name, value);
      }
      if (isAssetAttr(name) || (lower === "href" && isImagePreloadLink(this))) {
        value = lower === "href" ? toProxy(value) : rewriteAttrValue(name, value);
      }
      return origSetAttribute.call(this, name, value);
    };

    if (typeof HTMLImageElement !== "undefined") {
      var proto = HTMLImageElement.prototype;
      var srcDesc = Object.getOwnPropertyDescriptor(proto, "src");
      if (srcDesc && srcDesc.set) {
        Object.defineProperty(proto, "src", {
          configurable: true,
          enumerable: srcDesc.enumerable,
          get: srcDesc.get,
          set: function(value) {
            srcDesc.set.call(this, toProxy(value));
          },
        });
      }
      var srcsetDesc = Object.getOwnPropertyDescriptor(proto, "srcset");
      if (srcsetDesc && srcsetDesc.set) {
        Object.defineProperty(proto, "srcset", {
          configurable: true,
          enumerable: srcsetDesc.enumerable,
          get: srcsetDesc.get,
          set: function(value) {
            srcsetDesc.set.call(this, rewriteSrcset(value));
          },
        });
      }
    }

    if (typeof HTMLMediaElement !== "undefined") {
      var mediaProto = HTMLMediaElement.prototype;
      var mediaSrcDesc = Object.getOwnPropertyDescriptor(mediaProto, "src");
      if (mediaSrcDesc && mediaSrcDesc.set) {
        Object.defineProperty(mediaProto, "src", {
          configurable: true,
          enumerable: mediaSrcDesc.enumerable,
          get: mediaSrcDesc.get,
          set: function(value) {
            mediaSrcDesc.set.call(this, toProxy(value));
          },
        });
      }
    }

    if (typeof HTMLIFrameElement !== "undefined") {
      var iframeProto = HTMLIFrameElement.prototype;
      var iframeSrcDesc = Object.getOwnPropertyDescriptor(iframeProto, "src");
      if (iframeSrcDesc && iframeSrcDesc.set) {
        Object.defineProperty(iframeProto, "src", {
          configurable: true,
          enumerable: iframeSrcDesc.enumerable,
          get: iframeSrcDesc.get,
          set: function(value) {
            iframeSrcDesc.set.call(this, toAbsolute(value));
          },
        });
      }
    }
  }

  patchDomSetters();

  function rewriteTree(root) {
    if (!root) return;
    if (root.nodeType === 1) rewriteElement(root);
    if (root.querySelectorAll) {
      root.querySelectorAll("img,source,video,audio,picture,iframe,link[rel='preload'][as='image']").forEach(rewriteElement);
    }
  }

  rewriteTree(document.documentElement);

  var scheduled = false;
  function scheduleRewrite() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function() {
      scheduled = false;
      rewriteTree(document.documentElement);
    });
  }

  new MutationObserver(scheduleRewrite).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "imagesrc", "imagesrcset", "data-src", "data-srcset", "data-lazy-src", "data-iframe-src", "poster"],
  });

  document.addEventListener("DOMContentLoaded", function() { rewriteTree(document.documentElement); });
  window.addEventListener("load", function() { rewriteTree(document.documentElement); });
  setInterval(function() { rewriteTree(document.documentElement); }, 2000);
})();
`.trim();
}

export function injectAssetRuntime(
  html: string,
  proxyOrigin: string,
  pageReferer: string,
): string {
  const script = `<script id="migratex-asset-runtime">${buildAssetRuntimeScript(proxyOrigin, pageReferer)}</script>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${script}`);
  }
  return `${script}${html}`;
}

export { shouldProxyCssUrl };
