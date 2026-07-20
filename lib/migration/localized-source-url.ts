import {
  matchesLanguageCode,
  normalizeLanguageCode,
} from "@/lib/migration/language-mapping";
import { extractLocaleFromUrl } from "@/lib/migration/locale-from-url";

function localePathCandidates(language: string): string[] {
  const trimmed = language.trim();
  const normalized = normalizeLanguageCode(trimmed);
  const base = normalized.split("-")[0];
  const candidates: string[] = [];

  // Many marketing sites use short path segments (/fr/, /de/) not regional (/fr-FR/).
  if (base) {
    candidates.push(base);
  }
  if (trimmed) {
    candidates.push(trimmed);
  }
  if (normalized !== trimmed.toLowerCase()) {
    candidates.push(normalized);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function isUnreliableAlternateHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host === "example.com" ||
    host.endsWith(".example") ||
    host.endsWith(".example.com") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

/**
 * Keep alternate path/query but force the crawled page's origin when hreflang
 * points at a different (often placeholder) host.
 */
export function rebaseAlternateUrlOntoSourceOrigin(
  alternateUrl: string,
  sourcePageUrl: string,
): string {
  try {
    const alternate = new URL(alternateUrl);
    const source = new URL(sourcePageUrl);

    if (alternate.origin === source.origin) {
      return alternate.toString();
    }

    const rebased = new URL(source.origin);
    rebased.pathname = alternate.pathname;
    rebased.search = alternate.search;
    rebased.hash = alternate.hash;
    return rebased.toString();
  } catch {
    return alternateUrl;
  }
}

function resolveAlternateUrl(
  alternateUrls: Record<string, string> | undefined,
  targetLanguage: string,
  sourcePageUrl: string,
): string | undefined {
  if (!alternateUrls) {
    return undefined;
  }

  const normalizedTarget = normalizeLanguageCode(targetLanguage);
  for (const [code, url] of Object.entries(alternateUrls)) {
    const normalizedCode = normalizeLanguageCode(code);
    if (!matchesLanguageCode(normalizedCode, normalizedTarget)) {
      continue;
    }

    const trimmed = url.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const alternate = new URL(trimmed, sourcePageUrl);
      const source = new URL(sourcePageUrl);

      if (alternate.origin === source.origin) {
        return alternate.toString();
      }

      if (
        isUnreliableAlternateHost(alternate.hostname) ||
        alternate.origin !== source.origin
      ) {
        return rebaseAlternateUrlOntoSourceOrigin(
          alternate.toString(),
          sourcePageUrl,
        );
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function stripLocalePrefix(pathname: string, locale: string): string {
  const localePattern = new RegExp(
    `^/${locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=/|$)`,
    "i",
  );
  const stripped = pathname.replace(localePattern, "");
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

function isEnglishLanguage(language: string): boolean {
  const normalized = normalizeLanguageCode(language);
  return normalized === "en" || normalized.startsWith("en-");
}

/** Replaces or inserts a locale folder segment in a source page URL. */
export function swapUrlLocale(pageUrl: string, targetLanguage: string): string {
  try {
    const url = new URL(pageUrl);
    const currentLocale = extractLocaleFromUrl(pageUrl);
    const candidates = localePathCandidates(targetLanguage);
    const englishTarget = isEnglishLanguage(targetLanguage);

    if (currentLocale) {
      if (englishTarget) {
        url.pathname = stripLocalePrefix(url.pathname, currentLocale) || "/";
        return url.toString();
      }

      const localePattern = new RegExp(
        `^/${currentLocale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=/|$)`,
        "i",
      );
      for (const candidate of candidates) {
        if (localePattern.test(url.pathname)) {
          url.pathname = url.pathname.replace(localePattern, `/${candidate}`);
          return url.toString();
        }
      }
    }

    if (englishTarget) {
      return url.toString();
    }

    for (const candidate of candidates) {
      const pathname = url.pathname.startsWith("/")
        ? url.pathname
        : `/${url.pathname}`;
      url.pathname = `/${candidate}${pathname}`.replace(/\/{2,}/g, "/");
      return url.toString();
    }
  } catch {
    return pageUrl;
  }

  return pageUrl;
}

export interface ResolveLocalizedSourceUrlOptions {
  alternateUrls?: Record<string, string>;
  primarySourceLanguage?: string;
}

/**
 * Resolves the source website URL for a target Sitecore language.
 * Prefers hreflang alternates (rebased onto the crawled origin when needed),
 * then swaps the URL locale segment.
 */
export function resolveLocalizedSourceUrl(
  sourcePageUrl: string,
  targetLanguage: string,
  options?: ResolveLocalizedSourceUrlOptions,
): string {
  const primary =
    options?.primarySourceLanguage?.trim() ||
    extractLocaleFromUrl(sourcePageUrl) ||
    "en";
  const normalizedTarget = normalizeLanguageCode(targetLanguage);
  const normalizedPrimary = normalizeLanguageCode(primary);

  if (matchesLanguageCode(normalizedTarget, normalizedPrimary)) {
    return sourcePageUrl;
  }

  const fromAlternate = resolveAlternateUrl(
    options?.alternateUrls,
    targetLanguage,
    sourcePageUrl,
  );
  if (fromAlternate) {
    return fromAlternate;
  }

  return swapUrlLocale(sourcePageUrl, targetLanguage);
}
