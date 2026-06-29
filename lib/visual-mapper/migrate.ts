import type { BlockMatchResult } from "@/types/ai-match";
import type { MappingEntry } from "@/types/visual-mapper";

export function mappingEntriesToBlockMatchResults(
  entries: MappingEntry[],
  pageUrl: string,
  pageTitle: string,
): BlockMatchResult[] {
  return entries.map((entry) => {
    const firstTextField = entry.fieldAssignments.find(
      (field) =>
        field.value &&
        !/image|link|general link/i.test(field.fieldType) &&
        !/image|link|cta|url/i.test(field.sitecoreField),
    );

    return {
      blockId: entry.id,
      pageUrl: entry.sourcePageUrl || pageUrl,
      blockType: "unknown",
      blockHeading: firstTextField?.value ?? pageTitle,
      matchScore: 100,
      confidence: "high",
      renderingName: entry.renderingName,
      renderingPath: entry.renderingPath,
      templateName: entry.templateName,
      templatePath: entry.templatePath,
      reasoning: "Manually mapped by user via Visual Mapper",
      fieldMappings: entry.fieldAssignments.map((field) => ({
        sitecoreField: field.sitecoreField,
        fieldType: field.fieldType,
        sourceRegion: field.sourceSelector,
        sourcePreview: field.value || field.valuePreview,
      })),
      needsReview: false,
    };
  });
}

export interface VisualMapperMigrationResult {
  matches: BlockMatchResult[];
  partialCount: number;
}

export function prepareVisualMapperMigration(
  entries: MappingEntry[],
  pageUrl: string,
  pageTitle: string,
): VisualMapperMigrationResult {
  const partialCount = entries.filter(
    (entry) =>
      entry.fieldAssignments.length === 0 ||
      entry.fieldAssignments.every((field) => !field.value.trim()),
  ).length;

  return {
    matches: mappingEntriesToBlockMatchResults(entries, pageUrl, pageTitle),
    partialCount,
  };
}
