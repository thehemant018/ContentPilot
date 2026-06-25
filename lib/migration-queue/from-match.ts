import { enrichImageFieldAlts } from "@/lib/migration/image-metadata";
import {
  DEFAULT_MIGRATION_LANGUAGE,
  DEFAULT_PRESENTATION_PLACEHOLDER,
} from "@/lib/migration/constants";
import type { BlockMatchResult } from "@/types/ai-match";
import type { CrawlImage } from "@/types/crawl";
import type {
  EditableFieldValue,
  MigrationQueueItem,
} from "@/types/migration-queue";

export function queueItemFromMatch(
  match: BlockMatchResult,
  blockImages: CrawlImage[] = [],
): MigrationQueueItem {
  const fields: EditableFieldValue[] = enrichImageFieldAlts(
    match.fieldMappings.map((mapping, index) => ({
      id: `field-${match.blockId}-${index}`,
      sourceRegion: mapping.sourceRegion,
      sitecoreField: mapping.sitecoreField,
      fieldType: mapping.fieldType,
      section: mapping.section,
      value: mapping.sourcePreview,
      imageAlt: mapping.imageAlt,
    })),
    blockImages,
    match.pageUrl,
  );

  return {
    id: crypto.randomUUID(),
    addedAt: new Date().toISOString(),
    blockId: match.blockId,
    sourcePageUrl: match.pageUrl,
    blockType: match.blockType,
    blockHeading: match.blockHeading,
    renderingName: match.renderingName,
    renderingPath: match.renderingPath,
    templateName: match.templateName,
    templatePath: match.templatePath,
    matchScore: match.matchScore,
    confidence: match.confidence,
    reasoning: match.reasoning,
    targetPagePath: "",
    placeholder: DEFAULT_PRESENTATION_PLACEHOLDER,
    language: DEFAULT_MIGRATION_LANGUAGE,
    fields,
  };
}

export function queueItemKey(blockId: string, sourcePageUrl: string): string {
  return `${sourcePageUrl}::${blockId}`;
}
