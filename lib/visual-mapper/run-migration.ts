import {
  resolveDefaultPageLanguages,
  resolveMappedPageLanguage,
} from "@/lib/migration/language-mapping";
import { queueItemFromMatch, queueItemKey } from "@/lib/migration-queue/from-match";
import { prepareQueueForMigration } from "@/lib/migration/queue-sync";
import { prepareVisualMapperMigration } from "@/lib/visual-mapper/migrate";
import { inferVisualMapperParentBlockIds } from "@/lib/visual-mapper/queue-hierarchy";
import {
  getVisualMapperSourceLanguageCodes,
  getVisualMapperSourceLanguages,
} from "@/lib/visual-mapper/source-page-languages";
import {
  mappingEntryBlockId,
  resolveEntryBlockIds,
} from "@/lib/visual-mapper/template-key";
import { getMigrationQueue, saveMigrationQueue } from "@/lib/storage/migration-queue";
import { getDiscoveryResult } from "@/lib/storage/workflow-data";
import { useVisualMapperStore } from "@/lib/visual-mapper/store";
import type { BlockMatchResult } from "@/types/ai-match";
import type { RenderingPlaceholderProfile } from "@/types/discovery";
import type { MappingEntry } from "@/types/visual-mapper";
import type { MigrationQueueItem } from "@/types/migration-queue";

function prepareVisualMapperQueueItems(
  items: MigrationQueueItem[],
  renderingProfiles?: RenderingPlaceholderProfile[],
): MigrationQueueItem[] {
  const discovery = getDiscoveryResult();
  return prepareQueueForMigration(items, {
    placeholders: discovery?.placeholders,
    renderingProfiles: renderingProfiles ?? discovery?.renderingProfiles,
  });
}

function visualMapperLanguageOptions(pageUrl: string) {
  const discovery = getDiscoveryResult();
  const siteLanguages = discovery?.siteLanguages ?? [];
  const instanceLanguages = discovery?.instanceLanguages ?? [];
  const pageLanguages = getVisualMapperSourceLanguages(pageUrl);
  const sourceLanguages = getVisualMapperSourceLanguageCodes(pageUrl);
  const selectedFromStore = useVisualMapperStore.getState().selectedLanguages;

  return {
    discovery,
    instanceLanguages,
    siteLanguages,
    sourceLanguages,
    pageLanguage: pageLanguages?.detectedLanguage,
    sourceAlternateUrls: pageLanguages?.alternateUrls,
    selectedLanguages: selectedFromStore,
  };
}

export function mappingEntriesToQueueItems(
  entries: MappingEntry[],
  pageUrl: string,
  pageTitle: string,
  targetPagePath: string,
  renderingProfiles?: RenderingPlaceholderProfile[],
): MigrationQueueItem[] {
  const {
    discovery,
    instanceLanguages,
    siteLanguages,
    sourceLanguages,
    pageLanguage,
    sourceAlternateUrls,
    selectedLanguages,
  } = visualMapperLanguageOptions(pageUrl);
  const profiles = renderingProfiles ?? discovery?.renderingProfiles;
  const placeholders = discovery?.placeholders;
  const { matches } = prepareVisualMapperMigration(entries, pageUrl, pageTitle);
  const blockIdByEntryId = resolveEntryBlockIds(entries);
  const parentBlockIdByEntryId = inferVisualMapperParentBlockIds(
    entries,
    profiles,
    blockIdByEntryId,
    placeholders,
  );
  const matchByBlockId = new Map(
    matches.map((match) => [match.blockId, match]),
  );

  const defaultLanguages =
    selectedLanguages.length > 0
      ? selectedLanguages
      : resolveDefaultPageLanguages(pageUrl, sourceLanguages, {
          instanceLanguages,
          siteLanguages,
          pageLanguage,
        });

  const rawItems = entries.map((entry) => {
    const blockId = blockIdByEntryId.get(entry.id) ?? mappingEntryBlockId(entry);
    const match =
      matchByBlockId.get(blockId) ??
      matchByBlockId.get(mappingEntryBlockId(entry)) ??
      matches.find((candidate) => candidate.blockId === entry.id);
    if (!match) {
      throw new Error(`Missing match for visual mapper entry ${entry.id}`);
    }

    const mappedLanguage =
      defaultLanguages[0] ??
      resolveMappedPageLanguage(pageUrl, pageLanguage, {
        instanceLanguages,
        siteLanguages,
      });
    const item = queueItemFromMatch({ ...match, blockId }, [], {
      parentBlockId: parentBlockIdByEntryId.get(entry.id),
      language: mappedLanguage,
    });

    return {
      ...item,
      blockId,
      languages: defaultLanguages,
      primarySourceLanguage: mappedLanguage,
      sourceAlternateUrls,
      targetPagePath: targetPagePath.trim(),
      fields: item.fields.map((field, index) => ({
        ...field,
        value:
          match.fieldMappings[index]?.sourcePreview ??
          field.value,
      })),
    };
  });

  return prepareVisualMapperQueueItems(rawItems, profiles);
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
  const prepared = prepareVisualMapperQueueItems(merged);
  saveMigrationQueue(prepared);
  return {
    added: toAdd.length,
    skipped: newItems.length - toAdd.length,
    items: prepared,
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

  const prepared = prepareVisualMapperQueueItems(items);
  saveMigrationQueue(prepared);
  return { added, skipped, items: prepared };
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
