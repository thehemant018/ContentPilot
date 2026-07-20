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

/** Next.js image optimizer paths are media URLs, not page navigation links. */
export function isNextImageOptimizerUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, "https://example.local");
    return /\/_next\/image\/?$/i.test(parsed.pathname);
  } catch {
    return /\/_next\/image/i.test(trimmed);
  }
}

/** Prefer the real asset URL inside /_next/image?url=... when present. */
export function unwrapNextImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || !isNextImageOptimizerUrl(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, "https://example.local");
    const inner = parsed.searchParams.get("url");
    if (inner?.trim()) {
      return decodeURIComponent(inner.trim());
    }
  } catch {
    // keep original
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
  return unwrapNextImageUrl(unwrapProxiedUrl(resolved));
}
