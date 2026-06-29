import { queueItemFromMatch, queueItemKey } from "@/lib/migration-queue/from-match";
import { prepareVisualMapperMigration } from "@/lib/visual-mapper/migrate";
import { getMigrationQueue, saveMigrationQueue } from "@/lib/storage/migration-queue";
import type { BlockMatchResult } from "@/types/ai-match";
import type { MappingEntry } from "@/types/visual-mapper";
import type { MigrationQueueItem } from "@/types/migration-queue";

export function mappingEntriesToQueueItems(
  entries: MappingEntry[],
  pageUrl: string,
  pageTitle: string,
  targetPagePath: string,
): MigrationQueueItem[] {
  const { matches } = prepareVisualMapperMigration(entries, pageUrl, pageTitle);

  return matches.map((match) => {
    const item = queueItemFromMatch(match);
    return {
      ...item,
      targetPagePath: targetPagePath.trim(),
      fields: item.fields.map((field, index) => ({
        ...field,
        value:
          match.fieldMappings[index]?.sourcePreview ??
          field.value,
      })),
    };
  });
}

export function appendVisualMapperToMigrationQueue(
  entries: MappingEntry[],
  pageUrl: string,
  pageTitle: string,
  targetPagePath = "",
): { added: number; skipped: number; items: MigrationQueueItem[] } {
  const newItems = mappingEntriesToQueueItems(
    entries,
    pageUrl,
    pageTitle,
    targetPagePath,
  );
  const existing = getMigrationQueue();
  const existingKeys = new Set(
    existing.map((item) => queueItemKey(item.blockId, item.sourcePageUrl)),
  );
  const toAdd = newItems.filter(
    (item) =>
      !existingKeys.has(queueItemKey(item.blockId, item.sourcePageUrl)),
  );
  const merged = [...existing, ...toAdd];
  saveMigrationQueue(merged);
  return {
    added: toAdd.length,
    skipped: newItems.length - toAdd.length,
    items: merged,
  };
}

export function enqueueVisualMapperMappings(
  entries: MappingEntry[],
  pageUrl: string,
  pageTitle: string,
  targetPagePath: string,
): { items: MigrationQueueItem[]; partialCount: number; matches: BlockMatchResult[] } {
  const prepared = prepareVisualMapperMigration(entries, pageUrl, pageTitle);
  const items = mappingEntriesToQueueItems(
    entries,
    pageUrl,
    pageTitle,
    targetPagePath,
  );
  saveMigrationQueue(items);
  return {
    items,
    partialCount: prepared.partialCount,
    matches: prepared.matches,
  };
}
