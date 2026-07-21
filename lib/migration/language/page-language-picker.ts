import {
  buildLanguagePickerOptions,
  ensureDefaultEnglishSelection,
  listMappableSitecoreLanguages,
  resolveDefaultPageLanguages,
  resolveQueueLanguages,
  sanitizeSelectedLanguages,
} from "@/lib/migration/language/language-mapping";
import type { LanguagePickerOption } from "@/lib/migration/language/language-mapping";
import { getVisualMapperSourceLanguages } from "@/lib/visual-mapper/source-page-languages";
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
  extraSourceLanguages?: string[],
): {
  options: LanguagePickerOption[];
  selected: string[];
} {
  const instanceLanguages = discovery?.instanceLanguages ?? [];
  const siteLanguages = discovery?.siteLanguages ?? [];
  let sourceLanguages = resolveSourceLanguagesForPage(
    sourcePageUrl,
    crawlPages,
    crawlSourceLanguages,
  );
  let pageLanguage = crawlPages?.find(
    (entry) => entry.url === sourcePageUrl,
  )?.language;

  const extracted = getVisualMapperSourceLanguages(sourcePageUrl);
  if (extracted) {
    pageLanguage = extracted.detectedLanguage ?? pageLanguage;
    sourceLanguages = [
      ...sourceLanguages,
      ...(extracted.detectedLanguage ? [extracted.detectedLanguage] : []),
      ...extracted.availableLanguages,
    ];
  }

  if (extraSourceLanguages?.length) {
    sourceLanguages = [...sourceLanguages, ...extraSourceLanguages];
  }

  sourceLanguages = [...new Set(sourceLanguages.filter(Boolean))];

  const options = buildLanguagePickerOptions(
    listMappableSitecoreLanguages({
      instanceLanguages,
      siteLanguages,
    }),
    siteLanguages,
    sourceLanguages,
  );

  const fallbackSelected = resolveDefaultPageLanguages(
    sourcePageUrl,
    sourceLanguages,
    {
      instanceLanguages,
      siteLanguages,
      pageLanguage,
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
