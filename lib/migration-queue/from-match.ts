import type { BlockMatchResult } from "@/types/ai-match";
import type {
  EditableFieldValue,
  MigrationQueueItem,
} from "@/types/migration-queue";

export function queueItemFromMatch(match: BlockMatchResult): MigrationQueueItem {
  const fields: EditableFieldValue[] = match.fieldMappings.map(
    (mapping, index) => ({
      id: `field-${match.blockId}-${index}`,
      sourceRegion: mapping.sourceRegion,
      sitecoreField: mapping.sitecoreField,
      fieldType: mapping.fieldType,
      section: mapping.section,
      value: mapping.sourcePreview,
    }),
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
    placeholder: "main",
    language: "en",
    fields,
  };
}

export function queueItemKey(blockId: string, sourcePageUrl: string): string {
  return `${sourcePageUrl}::${blockId}`;
}
