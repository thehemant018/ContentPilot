/**
 * Normalizes a Sitecore item path for API lookups and export.
 * Ensures a leading slash and collapses duplicate separators.
 */
export function normalizeSitecoreItemPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return "";
  }

  let path = trimmed.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  return path.replace(/\/+$/, "") || path;
}

/** Aligns crawl source URLs so queue grouping is stable (trailing slash, etc.). */
export function normalizeSourcePageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "") || parsed.origin;
  } catch {
    return trimmed.replace(/\/$/, "") || trimmed;
  }
}
