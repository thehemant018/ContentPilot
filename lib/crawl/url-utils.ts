const DEFAULT_MAX_PAGES = 15;
const MAX_ALLOWED_PAGES = 50;

export function normalizeCrawlUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("URL is required.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const parsed = new URL(withProtocol);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "") || parsed.origin;
}

export function resolveCrawlMaxPages(value?: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return DEFAULT_MAX_PAGES;
  }

  return Math.min(Math.max(1, Math.floor(value)), MAX_ALLOWED_PAGES);
}

export function isSameOrigin(baseUrl: string, candidateUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const candidate = new URL(candidateUrl);
    return base.origin === candidate.origin;
  } catch {
    return false;
  }
}

export function normalizeDiscoveredLink(
  baseUrl: string,
  href: string,
): string | null {
  try {
    const resolved = new URL(href, baseUrl);
    if (!["http:", "https:"].includes(resolved.protocol)) {
      return null;
    }

    resolved.hash = "";
    const normalized = resolved.toString().replace(/\/$/, "") || resolved.origin;

    if (!isSameOrigin(baseUrl, normalized)) {
      return null;
    }

    if (/\.(pdf|zip|png|jpe?g|gif|webp|svg|mp4|mp3|docx?|xlsx?)$/i.test(resolved.pathname)) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}
