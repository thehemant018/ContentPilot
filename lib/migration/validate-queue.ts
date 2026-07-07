import {
  buildComponentsFromQueue,
  prepareQueueForMigration,
} from "@/lib/migration/queue-sync";
import type { MigrationQueueItem } from "@/types/migration-queue";

export interface MigrationQueueValidation {
  success: boolean;
  message: string;
  componentCount?: number;
  pageCount?: number;
}

export function validateMigrationQueue(
  queue: MigrationQueueItem[],
): MigrationQueueValidation {
  if (queue.length === 0) {
    return {
      success: false,
      message: "Migration queue is empty.",
    };
  }

  const prepared = prepareQueueForMigration(queue);
  const missingTarget = prepared.filter((item) => !item.targetPagePath.trim());

  if (missingTarget.length > 0) {
    return {
      success: false,
      message: `${missingTarget.length} item(s) are missing a target Sitecore page path.`,
    };
  }

  const components = buildComponentsFromQueue(prepared, new Date().toISOString());
  if (components.length === 0) {
    return {
      success: false,
      message: "No components are ready to migrate.",
    };
  }

  const pageCount = new Set(
    components.map(
      (item) =>
        `${item.targetPagePath}::${item.presentation.language || "en"}`,
    ),
  ).size;

  return {
    success: true,
    message: `${components.length} component(s) across ${pageCount} target page(s) ready to push.`,
    componentCount: components.length,
    pageCount,
  };
}
