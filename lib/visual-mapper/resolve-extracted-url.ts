/**
 * Resolves user-facing URLs from proxied iframe values back to original site URLs.
 */

export function unwrapProxiedUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.endsWith("/api/proxy-asset")) {
      const inner = parsed.searchParams.get("url");
      if (inner) {
        return decodeURIComponent(inner);
      }
    }
    if (parsed.pathname.endsWith("/api/proxy-page")) {
      const inner = parsed.searchParams.get("url");
      if (inner) {
        return decodeURIComponent(inner);
      }
    }
  } catch {
    // not an absolute URL
  }

  return trimmed;
}

export function resolveNavigationHref(
  raw: string,
  pageSourceUrl: string,
): string {
  const trimmed = raw.trim();
  if (!trimmed || /^(#|javascript:|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }

  const unwrapped = unwrapProxiedUrl(trimmed);
  if (/^https?:\/\//i.test(unwrapped)) {
    return unwrapped;
  }

  try {
    return new URL(unwrapped, pageSourceUrl).href;
  } catch {
    return unwrapped;
  }
}

export function resolveMediaSrc(raw: string, pageSourceUrl: string): string {
  const resolved = resolveNavigationHref(raw, pageSourceUrl);
  return unwrapProxiedUrl(resolved);
}
