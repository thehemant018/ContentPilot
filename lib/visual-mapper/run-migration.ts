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

export interface BulkQueuePageInput {
  mappings: MappingEntry[];
  pageUrl: string;
  pageTitle: string;
  targetPagePath: string;
}

/** Build queue items for bulk-applied pages without modifying the stored queue. */
export function buildBulkApplyQueueItems(
  pages: BulkQueuePageInput[],
): MigrationQueueItem[] {
  const items: MigrationQueueItem[] = [];

  for (const page of pages) {
    if (page.mappings.length === 0) {
      continue;
    }

    items.push(
      ...mappingEntriesToQueueItems(
        page.mappings,
        page.pageUrl,
        page.pageTitle,
        page.targetPagePath,
      ),
    );
  }

  return items;
}

/** Add bulk-applied pages to the review queue without duplicates. */
export function appendBulkApplyToMigrationQueue(
  pages: BulkQueuePageInput[],
): { added: number; skipped: number; items: MigrationQueueItem[] } {
  let added = 0;
  let skipped = 0;
  let items = getMigrationQueue();

  for (const page of pages) {
    if (page.mappings.length === 0) {
      continue;
    }

    const newItems = mappingEntriesToQueueItems(
      page.mappings,
      page.pageUrl,
      page.pageTitle,
      page.targetPagePath,
    );
    const existingKeys = new Set(
      items.map((item) => queueItemKey(item.blockId, item.sourcePageUrl)),
    );
    const toAdd = newItems.filter(
      (item) =>
        !existingKeys.has(queueItemKey(item.blockId, item.sourcePageUrl)),
    );
    skipped += newItems.length - toAdd.length;
    added += toAdd.length;
    items = [...items, ...toAdd];
  }

  saveMigrationQueue(items);
  return { added, skipped, items };
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
