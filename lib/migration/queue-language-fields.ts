import {
  matchesLanguageCode,
  normalizeLanguageCode,
} from "@/lib/migration/language-mapping";
import { DEFAULT_MIGRATION_LANGUAGE } from "@/lib/migration/constants";
import type {
  EditableFieldValue,
  MigrationQueueItem,
} from "@/types/migration-queue";

export function resolvePrimarySourceLanguage(item: MigrationQueueItem): string {
  return (
    item.primarySourceLanguage?.trim() ||
    item.language?.trim() ||
    DEFAULT_MIGRATION_LANGUAGE
  );
}

/** Look up manually edited fields for a Sitecore language version. */
export function getFieldsForLanguage(
  item: MigrationQueueItem,
  language: string,
): EditableFieldValue[] | undefined {
  const byLanguage = item.fieldsByLanguage;
  if (!byLanguage) {
    return undefined;
  }

  const normalizedTarget = normalizeLanguageCode(language);
  for (const [code, fields] of Object.entries(byLanguage)) {
    if (matchesLanguageCode(normalizeLanguageCode(code), normalizedTarget)) {
      return fields;
    }
  }

  return byLanguage[language];
}

export function isSameMigrationLanguage(left: string, right: string): boolean {
  return matchesLanguageCode(
    normalizeLanguageCode(left),
    normalizeLanguageCode(right),
  );
}
