import { DEFAULT_MIGRATION_LANGUAGE } from "@/lib/migration/constants";
import { extractLocaleFromUrl } from "@/lib/migration/locale-from-url";
import type { SitecoreLanguage } from "@/types/language";
import type { MigrationQueueItem } from "@/types/migration-queue";

export function normalizeLanguageCode(code: string): string {
  return code.trim().toLowerCase().replace(/_/g, "-");
}

export function languageCandidates(language: SitecoreLanguage): string[] {
  const values = [language.name, language.iso].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return values.map(normalizeLanguageCode);
}

export function matchesLanguageCode(
  source: string,
  candidate: string,
): boolean {
  if (source === candidate) {
    return true;
  }
  if (source.length === 2 && candidate.startsWith(`${source}-`)) {
    return true;
  }
  if (candidate.length === 2 && source.startsWith(`${candidate}-`)) {
    return true;
  }
  const sourceBase = source.split("-")[0] ?? source;
  const candidateBase = candidate.split("-")[0] ?? candidate;
  return sourceBase.length === 2 && sourceBase === candidateBase;
}

export function sitecoreLanguageMatchesSource(
  language: SitecoreLanguage,
  sourceCode: string,
): boolean {
  const normalizedSource = normalizeLanguageCode(sourceCode);
  return languageCandidates(language).some((candidate) =>
    matchesLanguageCode(normalizedSource, candidate),
  );
}

export function isLanguageOnSite(
  language: SitecoreLanguage,
  siteLanguages: SitecoreLanguage[],
): boolean {
  return siteLanguages.some((siteLanguage) => siteLanguage.name === language.name);
}

export function isLanguageMatchedForMigration(
  language: SitecoreLanguage,
  sourceLanguages: string[],
  siteLanguages: SitecoreLanguage[],
): boolean {
  if (!isLanguageOnSite(language, siteLanguages)) {
    return false;
  }

  if (
    language.name === DEFAULT_MIGRATION_LANGUAGE ||
    sitecoreLanguageMatchesSource(language, DEFAULT_MIGRATION_LANGUAGE)
  ) {
    return true;
  }

  return sourceLanguages.some((sourceCode) =>
    sitecoreLanguageMatchesSource(language, sourceCode),
  );
}

export interface LanguagePickerOption {
  language: SitecoreLanguage;
  label: string;
  selectable: boolean;
  hint?: string;
}

/**
 * Builds picker rows for all instance languages. Selectable when the language
 * exists on the target Sitecore site AND matches a source website language
 * (handles regional codes like ja vs ja-JP).
 */
export function buildLanguagePickerOptions(
  instanceLanguages: SitecoreLanguage[],
  siteLanguages: SitecoreLanguage[],
  sourceLanguages: string[],
): LanguagePickerOption[] {
  const pool = listMappableSitecoreLanguages({
    instanceLanguages,
    siteLanguages,
  });

  const withDefaultEnglish = pool.some(
    (language) => language.name === DEFAULT_MIGRATION_LANGUAGE,
  )
    ? pool
    : [
        { name: DEFAULT_MIGRATION_LANGUAGE, iso: DEFAULT_MIGRATION_LANGUAGE },
        ...pool,
      ];

  const sourceWithEnglish = sourceLanguages;

  return withDefaultEnglish.map((language) => {
    const onSite = isLanguageOnSite(language, siteLanguages);
    const onSource = sourceWithEnglish.some((sourceCode) =>
      sitecoreLanguageMatchesSource(language, sourceCode),
    );
    const selectable = isLanguageMatchedForMigration(
      language,
      sourceWithEnglish,
      siteLanguages,
    );
    const isDefaultEnglish =
      language.name === DEFAULT_MIGRATION_LANGUAGE ||
      sitecoreLanguageMatchesSource(language, DEFAULT_MIGRATION_LANGUAGE);

    let hint: string | undefined;
    if (!onSite) {
      hint = "Not on target Sitecore site";
    } else if (isDefaultEnglish && !onSource) {
      hint = "Default language (always available on target site)";
    } else if (!onSource) {
      hint = "Not on source website";
    }

    return {
      language,
      label: formatSitecoreLanguageLabel(language),
      selectable,
      hint,
    };
  });
}

export function mapSourceToSitecoreLanguage(
  sourceCode: string | undefined,
  options: {
    instanceLanguages?: SitecoreLanguage[];
    siteLanguages?: SitecoreLanguage[];
    fallback?: string;
  },
): string {
  const pool =
    options.siteLanguages?.length
      ? options.siteLanguages
      : (options.instanceLanguages ?? []);
  const fallback = options.fallback?.trim() || DEFAULT_MIGRATION_LANGUAGE;

  if (!sourceCode?.trim()) {
    return pool[0]?.name ?? fallback;
  }

  if (pool.length === 0) {
    return sourceCode.trim();
  }

  const normalizedSource = normalizeLanguageCode(sourceCode);

  for (const language of pool) {
    if (
      languageCandidates(language).some((candidate) =>
        matchesLanguageCode(normalizedSource, candidate),
      )
    ) {
      return language.name;
    }
  }

  return fallback;
}

export function resolveMappedPageLanguage(
  pageUrl: string,
  pageLanguage: string | undefined,
  options: {
    instanceLanguages?: SitecoreLanguage[];
    siteLanguages?: SitecoreLanguage[];
  },
): string {
  const fromUrl = extractLocaleFromUrl(pageUrl);
  const source = pageLanguage?.trim() || fromUrl || undefined;

  return mapSourceToSitecoreLanguage(source, options);
}

export function listMappableSitecoreLanguages(options: {
  instanceLanguages?: SitecoreLanguage[];
  siteLanguages?: SitecoreLanguage[];
}): SitecoreLanguage[] {
  if (options.instanceLanguages?.length) {
    return options.instanceLanguages;
  }
  return options.siteLanguages ?? [];
}

export function formatSitecoreLanguageLabel(language: SitecoreLanguage): string {
  const parts = [language.name];
  if (language.englishName && language.englishName !== language.name) {
    parts.push(language.englishName);
  } else if (language.nativeName && language.nativeName !== language.name) {
    parts.push(language.nativeName);
  }
  return parts.join(" — ");
}

/** Resolves the Sitecore English language name on the site (prefers exact `en`). */
export function resolveSiteEnglishLanguage(
  pickerOptions: LanguagePickerOption[],
): string | undefined {
  const selectable = pickerOptions.filter((option) => option.selectable);
  const exact = selectable.find(
    (option) => option.language.name === DEFAULT_MIGRATION_LANGUAGE,
  );
  if (exact) {
    return exact.language.name;
  }

  const regional = selectable.find((option) =>
    sitecoreLanguageMatchesSource(option.language, DEFAULT_MIGRATION_LANGUAGE),
  );
  return regional?.language.name;
}

export function ensureDefaultEnglishSelection(
  selected: string[],
  pickerOptions: LanguagePickerOption[],
): string[] {
  const english = resolveSiteEnglishLanguage(pickerOptions);
  if (!english) {
    return selected.length > 0 ? selected : [DEFAULT_MIGRATION_LANGUAGE];
  }

  if (selected.includes(english)) {
    return selected;
  }

  return [english, ...selected];
}

/** Puts base languages before regional variants (e.g. en before en-IN). */
export function compareMigrationLanguageOrder(a: string, b: string): number {
  const aNorm = normalizeLanguageCode(a);
  const bNorm = normalizeLanguageCode(b);

  const aRegional = aNorm.includes("-") ? 1 : 0;
  const bRegional = bNorm.includes("-") ? 1 : 0;
  if (aRegional !== bRegional) {
    return aRegional - bRegional;
  }

  const aBase = aNorm.split("-")[0] ?? aNorm;
  const bBase = bNorm.split("-")[0] ?? bNorm;
  const aEn = aBase === "en" ? 0 : 1;
  const bEn = bBase === "en" ? 0 : 1;
  if (aEn !== bEn) {
    return aEn - bEn;
  }

  return aNorm.localeCompare(bNorm);
}

export function sortLanguagesForMigration(languages: string[]): string[] {
  return [...new Set(languages.map((language) => language.trim()).filter(Boolean))].sort(
    compareMigrationLanguageOrder,
  );
}

export function resolveQueueLanguages(item: MigrationQueueItem): string[] {
  const fromArray = (item.languages ?? [])
    .map((language) => language.trim())
    .filter(Boolean);
  if (fromArray.length > 0) {
    return sortLanguagesForMigration(fromArray);
  }

  const single = item.language?.trim();
  if (single) {
    return [single];
  }

  return [DEFAULT_MIGRATION_LANGUAGE];
}

export function resolveDefaultPageLanguages(
  sourcePageUrl: string,
  sourceLanguages: string[],
  options: {
    instanceLanguages?: SitecoreLanguage[];
    siteLanguages?: SitecoreLanguage[];
    pageLanguage?: string;
  },
): string[] {
  const pickerOptions = buildLanguagePickerOptions(
    listMappableSitecoreLanguages(options),
    options.siteLanguages ?? [],
    sourceLanguages,
  );
  const selectable = pickerOptions.filter((entry) => entry.selectable);

  if (selectable.length === 0) {
    const mapped = resolveMappedPageLanguage(
      sourcePageUrl,
      options.pageLanguage,
      options,
    );
    return mapped ? [mapped] : [DEFAULT_MIGRATION_LANGUAGE];
  }

  const detected =
    options.pageLanguage?.trim() ||
    extractLocaleFromUrl(sourcePageUrl) ||
    sourceLanguages[0];

  if (detected) {
    const matched = selectable.filter((entry) =>
      sitecoreLanguageMatchesSource(entry.language, detected),
    );
    if (matched.length > 0) {
      return ensureDefaultEnglishSelection(
        matched.map((entry) => entry.language.name),
        pickerOptions,
      );
    }
  }

  return ensureDefaultEnglishSelection(
    [selectable[0]!.language.name],
    pickerOptions,
  );
}

/** Codes from Sitecore languages for matching when source HTML extraction is unavailable. */
export function sourceCodesFromSitecoreLanguages(
  languages: SitecoreLanguage[],
): string[] {
  const codes = new Set<string>();
  for (const language of languages) {
    if (language.name?.trim()) {
      codes.add(language.name.trim());
    }
    if (language.iso?.trim()) {
      codes.add(language.iso.trim());
    }
  }
  return [...codes].sort((left, right) => left.localeCompare(right));
}

export function sanitizeSelectedLanguages(
  selected: string[],
  pickerOptions: LanguagePickerOption[],
): string[] {
  const allowed = new Set(
    pickerOptions
      .filter((option) => option.selectable)
      .map((option) => option.language.name),
  );

  const cleaned = selected
    .map((language) => language.trim())
    .filter((language) => language && allowed.has(language));

  return ensureDefaultEnglishSelection([...new Set(cleaned)], pickerOptions);
}
