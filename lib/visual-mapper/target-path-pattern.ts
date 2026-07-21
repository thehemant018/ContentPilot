import { sanitizePathSegment } from "@/lib/migration/queue/build-export";
import { extractLocaleFromUrl } from "@/lib/migration/language/locale-from-url";
import { normalizeSitecoreItemPath } from "@/lib/migration/target/sitecore-path";

const PLACEHOLDER_PATTERN = /\{(slug|locale|path)\}/i;

/** Last path segment from a source page URL (before Sitecore name sanitization). */
export function extractUrlSlug(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const raw = segments[segments.length - 1] ?? "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return "";
  }
}

/** Sitecore-safe page item name derived from a URL slug. */
export function slugToPageItemName(slug: string): string {
  const sanitized = sanitizePathSegment(slug);
  return sanitized || "page";
}

/** Resolve `{slug}`, `{locale}`, `{path}` placeholders from a source page URL. */
export function resolveTargetPagePath(
  pattern: string,
  pageUrl: string,
): string {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(pageUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const rawSlug = segments[segments.length - 1] ?? "";
    const slug = slugToPageItemName(rawSlug);
    const locale = extractLocaleFromUrl(pageUrl) ?? "";

    let basePattern = trimmed;
    if (!PLACEHOLDER_PATTERN.test(trimmed)) {
      basePattern = `${trimmed.replace(/\/+$/, "")}/{slug}`;
    }

    const resolved = basePattern
      .replace(/\{slug\}/gi, slug)
      .replace(/\{locale\}/gi, locale)
      .replace(/\{path\}/gi, url.pathname.replace(/\/$/, "") || "/");

    return normalizeSitecoreItemPath(resolved);
  } catch {
    return normalizeSitecoreItemPath(trimmed);
  }
}

/** Sitecore item name (last segment) for a resolved target page path. */
export function pageNameFromTargetPath(targetPagePath: string): string {
  const normalized = normalizeSitecoreItemPath(targetPagePath);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) {
    return normalized;
  }
  return normalized.slice(lastSlash + 1);
}
