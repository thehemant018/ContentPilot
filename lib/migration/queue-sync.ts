import { buildDatasourcePath, buildComponentExport } from "@/lib/migration/build-export";
import { logPresentationHierarchy } from "@/lib/migration/presentation-debug-log";
import {
  applyDiscoveryPlaceholderDefaults,
  linkQueueHierarchy,
} from "@/lib/migration/queue-hierarchy";
import type { MigrationComponentExport } from "@/types/migration-export";
import { buildSxaDatasourceParentPath } from "@/lib/sitecore/item-lookup";
import {
  normalizeSitecoreItemPath,
  normalizeSourcePageUrl,
} from "@/lib/migration/sitecore-path";
import type { MigrationQueueItem } from "@/types/migration-queue";
import type {
  PlaceholderDefinition,
  RenderingPlaceholderProfile,
} from "@/types/discovery";

export interface PrepareQueueOptions {
  placeholders?: PlaceholderDefinition[];
  renderingProfiles?: RenderingPlaceholderProfile[];
}

function shouldClearDatasourceOverride(
  item: MigrationQueueItem,
  previousTargetPagePath: string,
): boolean {
  const override = item.datasourcePath?.trim();
  if (!override) {
    return false;
  }

  const previousBase = normalizeSitecoreItemPath(previousTargetPagePath).replace(
    /\/$/,
    "",
  );
  if (!previousBase) {
    return false;
  }

  const autoForPrevious = buildDatasourcePath({
    ...item,
    targetPagePath: previousBase,
    datasourcePath: undefined,
  });

  if (override === autoForPrevious) {
    return true;
  }

  return override.includes(`${previousBase}/Data/`);
}

export function normalizeQueueItemPaths(
  item: MigrationQueueItem,
): MigrationQueueItem {
  return {
    ...item,
    sourcePageUrl: normalizeSourcePageUrl(item.sourcePageUrl),
    targetPagePath: normalizeSitecoreItemPath(item.targetPagePath),
    datasourcePath: item.datasourcePath?.trim()
      ? normalizeSitecoreItemPath(item.datasourcePath)
      : item.datasourcePath,
  };
}

/**
 * Clears a datasource override when it still points at a different page's Data folder.
 */
export function resolveQueueItemForPush(
  item: MigrationQueueItem,
): MigrationQueueItem {
  const normalized = normalizeQueueItemPaths(item);
  const target = normalized.targetPagePath;
  const override = normalized.datasourcePath?.trim();

  if (!target || !override) {
    return normalized;
  }

  const dataParent = buildSxaDatasourceParentPath(target);
  if (override === dataParent || override.startsWith(`${dataParent}/`)) {
    return normalized;
  }

  return { ...normalized, datasourcePath: undefined };
}

/**
 * Ensures all queue items on the same source page share page-level settings
 * and have normalized Sitecore paths before export or push.
 */
export function prepareQueueForMigration(
  queue: MigrationQueueItem[],
  options?: PrepareQueueOptions,
): MigrationQueueItem[] {
  const normalized = queue.map(normalizeQueueItemPaths);
  const bySource = new Map<string, MigrationQueueItem[]>();

  for (const item of normalized) {
    const group = bySource.get(item.sourcePageUrl) ?? [];
    group.push(item);
    bySource.set(item.sourcePageUrl, group);
  }

  const prepared: MigrationQueueItem[] = [];

  for (const items of bySource.values()) {
    const withTarget = items
      .filter((item) => item.targetPagePath.trim())
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    const lead = withTarget[0] ?? items[0]!;
    const targetPagePath = lead.targetPagePath;
    const placeholder = lead.placeholder;
    const language = lead.language;

    for (const item of items) {
      prepared.push(
        resolveQueueItemForPush({
          ...item,
          targetPagePath: targetPagePath || item.targetPagePath,
          placeholder: placeholder ?? item.placeholder,
          language: language ?? item.language,
        }),
      );
    }
  }

  const sorted = prepared.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const withDefaults = applyDiscoveryPlaceholderDefaults(
    sorted,
    options?.placeholders,
  );
  return linkQueueHierarchy(withDefaults, options?.renderingProfiles);
}

export function applyTargetPageChangeToQueueItem(
  item: MigrationQueueItem,
  nextTargetPagePath: string,
): MigrationQueueItem {
  const normalizedTarget = normalizeSitecoreItemPath(nextTargetPagePath);
  const next: MigrationQueueItem = {
    ...item,
    targetPagePath: normalizedTarget,
  };

  if (
    shouldClearDatasourceOverride(item, item.targetPagePath) &&
    normalizedTarget !== normalizeSitecoreItemPath(item.targetPagePath)
  ) {
    next.datasourcePath = undefined;
  }

  return next;
}

export function buildComponentsFromQueue(
  queue: MigrationQueueItem[],
  exportedAt: string,
  options?: PrepareQueueOptions,
): MigrationComponentExport[] {
  const preparedQueue = prepareQueueForMigration(queue, options);
  const queueItemsById = new Map(
    preparedQueue.map((queueItem) => [queueItem.id, queueItem]),
  );
  logPresentationHierarchy("buildComponentsFromQueue: prepared queue", {
    itemCount: preparedQueue.length,
    items: preparedQueue.map((item) => ({
      queueItemId: item.id,
      renderingName: item.renderingName,
      parentQueueItemId: item.parentQueueItemId,
      childPlaceholderKey: item.childPlaceholderKey,
      presentationDepth: item.presentationDepth,
      placeholder: item.placeholder,
    })),
  });
  const components: MigrationComponentExport[] = [];

  for (let index = 0; index < preparedQueue.length; index += 1) {
    const built = buildComponentExport(preparedQueue[index]!, index, exportedAt, {
      queueItemsById,
      renderingProfiles: options?.renderingProfiles,
    });
    if (built) {
      components.push(built);
    }
  }

  return components;
}
