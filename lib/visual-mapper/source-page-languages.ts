import { extractPageLanguages } from "@/lib/crawl/extract-languages";
import { normalizeSourcePageUrl } from "@/lib/migration/target/sitecore-path";
import { STORAGE_KEYS } from "@/lib/sitecore/constants";
import type { SourcePageLanguage } from "@/types/language";

type SourceLanguageMap = Record<string, SourcePageLanguage>;

function pageUrlKey(pageUrl: string): string {
  return normalizeSourcePageUrl(pageUrl);
}

function readMap(): SourceLanguageMap {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = localStorage.getItem(STORAGE_KEYS.visualMapperSourceLanguages);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as SourceLanguageMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: SourceLanguageMap): void {
  localStorage.setItem(
    STORAGE_KEYS.visualMapperSourceLanguages,
    JSON.stringify(map),
  );
}

/** Extract languages from the website URL loaded in Visual Mapper (iframe page). */
export function extractVisualMapperSourceLanguages(
  html: string,
  pageUrl: string,
): SourcePageLanguage {
  return extractPageLanguages(html, pageUrl);
}

export function saveVisualMapperSourceLanguages(
  pageUrl: string,
  languages: SourcePageLanguage,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const key = pageUrlKey(pageUrl);
  const map = readMap();
  map[key] = languages;

  // Also drop any legacy keys for the same page (trailing-slash variants).
  for (const existingKey of Object.keys(map)) {
    if (existingKey !== key && pageUrlKey(existingKey) === key) {
      delete map[existingKey];
      map[key] = languages;
    }
  }

  writeMap(map);
}

export function getVisualMapperSourceLanguages(
  pageUrl: string,
): SourcePageLanguage | null {
  if (typeof window === "undefined") {
    return null;
  }

  const map = readMap();
  const key = pageUrlKey(pageUrl);
  if (map[key]) {
    return map[key] ?? null;
  }

  // Fallback for older entries keyed with trailing slashes / raw URLs.
  for (const [existingKey, value] of Object.entries(map)) {
    if (pageUrlKey(existingKey) === key) {
      return value;
    }
  }

  return null;
}

export function getVisualMapperSourceLanguageCodes(pageUrl: string): string[] {
  const languages = getVisualMapperSourceLanguages(pageUrl);
  if (!languages) {
    return [];
  }

  const codes = new Set<string>();
  if (languages.detectedLanguage) {
    codes.add(languages.detectedLanguage);
  }
  for (const code of languages.availableLanguages) {
    codes.add(code);
  }
  return [...codes];
}

export function clearVisualMapperSourceLanguages(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(STORAGE_KEYS.visualMapperSourceLanguages);
}
