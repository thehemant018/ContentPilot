import {
  queueItemFromMatch,
  queueItemKey,
} from "@/lib/migration-queue/from-match";
import { DEFAULT_PRESENTATION_PLACEHOLDER } from "@/lib/migration/constants";
import { STORAGE_KEYS } from "@/lib/sitecore/constants";
import type { BlockMatchResult } from "@/types/ai-match";
import type { MigrationQueueItem } from "@/types/migration-queue";

export const MIGRATION_QUEUE_CHANGED_EVENT = "migratex-migration-queue-changed";

function dispatchQueueChanged(): void {
  window.dispatchEvent(new Event(MIGRATION_QUEUE_CHANGED_EVENT));
}

function normalizeQueueItem(item: MigrationQueueItem): MigrationQueueItem {
  const placeholder =
    item.placeholder?.trim() === "main"
      ? DEFAULT_PRESENTATION_PLACEHOLDER
      : item.placeholder;

  return placeholder === item.placeholder ? item : { ...item, placeholder };
}

export function getMigrationQueue(): MigrationQueueItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = localStorage.getItem(STORAGE_KEYS.migrationQueue);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as MigrationQueueItem[];
    return Array.isArray(parsed) ? parsed.map(normalizeQueueItem) : [];
  } catch {
    return [];
  }
}

export function saveMigrationQueue(items: MigrationQueueItem[]): void {
  localStorage.setItem(STORAGE_KEYS.migrationQueue, JSON.stringify(items));
  dispatchQueueChanged();
}

export function isMatchInQueue(match: BlockMatchResult): boolean {
  const key = queueItemKey(match.blockId, match.pageUrl);
  return getMigrationQueue().some(
    (item) => queueItemKey(item.blockId, item.sourcePageUrl) === key,
  );
}

export function addMatchToQueue(
  match: BlockMatchResult,
): { success: boolean; message: string } {
  if (isMatchInQueue(match)) {
    return {
      success: false,
      message: "This component is already in the review queue.",
    };
  }

  const items = getMigrationQueue();
  const newItem = queueItemFromMatch(match);
  const existingOnPage = items.find(
    (item) => item.sourcePageUrl === match.pageUrl,
  );
  if (existingOnPage) {
    newItem.targetPagePath = existingOnPage.targetPagePath;
    newItem.placeholder = existingOnPage.placeholder;
    newItem.language = existingOnPage.language;
  }
  items.push(newItem);
  saveMigrationQueue(items);

  return {
    success: true,
    message: "Added to review queue.",
  };
}

export function updateQueueItemsForSourcePage(
  sourcePageUrl: string,
  updates: Partial<
    Pick<MigrationQueueItem, "targetPagePath" | "placeholder" | "language">
  >,
): void {
  const items = getMigrationQueue().map((item) =>
    item.sourcePageUrl === sourcePageUrl ? { ...item, ...updates } : item,
  );
  saveMigrationQueue(items);
}

export function updateQueueItem(
  id: string,
  updates: Partial<
    Pick<
      MigrationQueueItem,
      | "targetPagePath"
      | "fields"
      | "placeholder"
      | "datasourcePath"
      | "language"
    >
  >,
): void {
  const items = getMigrationQueue().map((item) =>
    item.id === id ? { ...item, ...updates } : item,
  );
  saveMigrationQueue(items);
}

export function removeQueueItem(id: string): void {
  saveMigrationQueue(getMigrationQueue().filter((item) => item.id !== id));
}

export function clearMigrationQueue(): void {
  localStorage.removeItem(STORAGE_KEYS.migrationQueue);
  dispatchQueueChanged();
}

export function subscribeMigrationQueue(listener: () => void): () => void {
  window.addEventListener(MIGRATION_QUEUE_CHANGED_EVENT, listener);
  return () =>
    window.removeEventListener(MIGRATION_QUEUE_CHANGED_EVENT, listener);
}
