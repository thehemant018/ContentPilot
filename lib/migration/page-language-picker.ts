import {
  buildLanguagePickerOptions,
  ensureDefaultEnglishSelection,
  listMappableSitecoreLanguages,
  resolveDefaultPageLanguages,
  resolveQueueLanguages,
  sanitizeSelectedLanguages,
} from "@/lib/migration/language-mapping";
import type { LanguagePickerOption } from "@/lib/migration/language-mapping";
import type { DiscoveryResult } from "@/types/discovery";

export function resolveSourceLanguagesForPage(
  sourcePageUrl: string,
  crawlPages?: Array<{
    url: string;
    language?: string;
    availableLanguages?: string[];
  }>,
  crawlSourceLanguages?: string[],
): string[] {
  const page = crawlPages?.find((entry) => entry.url === sourcePageUrl);
  const codes = new Set<string>();

  if (page?.language) {
    codes.add(page.language);
  }
  for (const language of page?.availableLanguages ?? []) {
    codes.add(language);
  }
  for (const language of crawlSourceLanguages ?? []) {
    codes.add(language);
  }

  return [...codes].sort((left, right) => left.localeCompare(right));
}

export function buildPageLanguagePicker(
  sourcePageUrl: string,
  discovery: DiscoveryResult | null,
  selectedLanguages: string[],
  crawlPages?: Array<{
    url: string;
    language?: string;
    availableLanguages?: string[];
  }>,
  crawlSourceLanguages?: string[],
): {
  options: LanguagePickerOption[];
  selected: string[];
} {
  const instanceLanguages = discovery?.instanceLanguages ?? [];
  const siteLanguages = discovery?.siteLanguages ?? [];
  const sourceLanguages = resolveSourceLanguagesForPage(
    sourcePageUrl,
    crawlPages,
    crawlSourceLanguages,
  );

  const options = buildLanguagePickerOptions(
    listMappableSitecoreLanguages({
      instanceLanguages,
      siteLanguages,
    }),
    siteLanguages,
    sourceLanguages,
  );

  const page = crawlPages?.find((entry) => entry.url === sourcePageUrl);
  const fallbackSelected = resolveDefaultPageLanguages(
    sourcePageUrl,
    sourceLanguages,
    {
      instanceLanguages,
      siteLanguages,
      pageLanguage: page?.language,
    },
  );

  const selected = ensureDefaultEnglishSelection(
    selectedLanguages.length > 0
      ? sanitizeSelectedLanguages(selectedLanguages, options)
      : sanitizeSelectedLanguages(fallbackSelected, options),
    options,
  );

  return { options, selected };
}

export function readPageLanguagesFromQueueItem(item: {
  languages?: string[];
  language?: string;
}): string[] {
  return resolveQueueLanguages(
    item as Parameters<typeof resolveQueueLanguages>[0],
  );
}
