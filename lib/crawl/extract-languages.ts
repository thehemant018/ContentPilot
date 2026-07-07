import * as cheerio from "cheerio";
import { extractLocaleFromUrl } from "@/lib/migration/locale-from-url";
import type { SourcePageLanguage } from "@/types/language";

function normalizeDetectedLanguage(code: string | undefined): string | undefined {
  const trimmed = code?.trim();
  if (!trimmed || trimmed.toLowerCase() === "x-default") {
    return undefined;
  }
  return trimmed;
}

function collectUniqueLanguages(codes: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const languages: string[] = [];

  for (const code of codes) {
    const normalized = normalizeDetectedLanguage(code);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    languages.push(normalized);
  }

  return languages;
}

/** Detect page language and alternate languages from HTML and URL. */
export function extractPageLanguages(
  html: string,
  pageUrl: string,
): SourcePageLanguage {
  const $ = cheerio.load(html);
  const htmlLang = normalizeDetectedLanguage($("html").attr("lang"));
  const urlLocale = extractLocaleFromUrl(pageUrl);
  const hreflangCodes: string[] = [];
  const alternateUrls: Record<string, string> = {};

  $('link[rel="alternate"][hreflang]').each((_, element) => {
    const hreflang = normalizeDetectedLanguage($(element).attr("hreflang"));
    const href = $(element).attr("href")?.trim();
    if (hreflang) {
      hreflangCodes.push(hreflang);
      if (href) {
        try {
          alternateUrls[hreflang] = new URL(href, pageUrl).toString();
        } catch {
          // ignore invalid alternate href
        }
      }
    }
  });

  const availableLanguages = collectUniqueLanguages([
    urlLocale,
    htmlLang,
    ...hreflangCodes,
  ]);

  const detectedLanguage =
    urlLocale ??
    htmlLang ??
    hreflangCodes[0] ??
    availableLanguages[0];

  return {
    detectedLanguage: normalizeDetectedLanguage(detectedLanguage),
    availableLanguages,
    alternateUrls:
      Object.keys(alternateUrls).length > 0 ? alternateUrls : undefined,
  };
}

export function aggregateSourceLanguages(
  pages: Array<{ language?: string; availableLanguages?: string[] }>,
): string[] {
  const codes = new Set<string>();

  for (const page of pages) {
    if (page.language) {
      codes.add(page.language);
    }
    for (const language of page.availableLanguages ?? []) {
      codes.add(language);
    }
  }

  return [...codes].sort((left, right) => left.localeCompare(right));
}
