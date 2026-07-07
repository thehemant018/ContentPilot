import { resolveQueueLanguages } from "@/lib/migration/language-mapping";
import type { MigrationQueueItem } from "@/types/migration-queue";

/** Expands each queue item once per selected Sitecore language. */
export function expandQueueItemsForLanguages(
  queue: MigrationQueueItem[],
): MigrationQueueItem[] {
  const expanded: MigrationQueueItem[] = [];

  for (const item of queue) {
    for (const language of resolveQueueLanguages(item)) {
      expanded.push({
        ...item,
        language,
      });
    }
  }

  return expanded;
}
