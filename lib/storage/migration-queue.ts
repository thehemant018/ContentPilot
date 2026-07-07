import {
  queueItemFromMatch,
  queueItemKey,
} from "@/lib/migration-queue/from-match";
import {
  resolveDefaultPageLanguages,
  resolveMappedPageLanguage,
} from "@/lib/migration/language-mapping";
import {
  linkQueueHierarchy,
  applyDiscoveryPlaceholderDefaults,
} from "@/lib/migration/queue-hierarchy";
import { resolveChildPlaceholderKey } from "@/lib/migration/placeholder-registry";
import {
  applyTargetPageChangeToQueueItem,
  normalizeQueueItemPaths,
} from "@/lib/migration/queue-sync";
import { DEFAULT_PRESENTATION_PLACEHOLDER } from "@/lib/migration/constants";
import { normalizeSourcePageUrl } from "@/lib/migration/sitecore-path";
import { STORAGE_KEYS } from "@/lib/sitecore/constants";
import { getCrawlResult, getDiscoveryResult } from "@/lib/storage/workflow-data";
import type { BlockMatchResult } from "@/types/ai-match";
import type { CrawlImage } from "@/types/crawl";
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
    if (!Array.isArray(parsed)) {
      return [];
    }
    const normalized = parsed.map(normalizeQueueItem);
    const discovery = getDiscoveryResult();
    const linked = linkQueueHierarchy(
      applyDiscoveryPlaceholderDefaults(normalized, discovery?.placeholders),
      discovery?.renderingProfiles,
    );
    const changed = JSON.stringify(linked) !== JSON.stringify(normalized);
    if (changed) {
      saveMigrationQueue(linked);
    }
    return linked;
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

function findBlockImages(match: BlockMatchResult): CrawlImage[] {
  const crawl = getCrawlResult();
  const page = crawl?.pages?.find((entry) => entry.url === match.pageUrl);
  const parentBlock = match.parentBlockId
    ? page?.blocks.find((entry) => entry.id === match.parentBlockId)
    : undefined;
  const block =
    page?.blocks.find((entry) => entry.id === match.blockId) ??
    parentBlock?.subBlocks?.find((entry) => entry.id === match.blockId);
  return block?.images ?? [];
}

export function addMatchToQueue(
  match: BlockMatchResult,
): { success: boolean; message: string } {
  if (match.unmatched) {
    return {
      success: false,
      message:
        "This block has no Sitecore component match and cannot be added to the queue.",
    };
  }

  if (!match.renderingPath || !match.templatePath) {
    return {
      success: false,
      message: "Resolve a rendering and template before adding to the queue.",
    };
  }

  if (isMatchInQueue(match)) {
    return {
      success: false,
      message: "This component is already in the review queue.",
    };
  }

  const items = getMigrationQueue();
  const discovery = getDiscoveryResult();
  const crawl = getCrawlResult();
  const normalizedPageUrl = normalizeSourcePageUrl(match.pageUrl);

  const existingParent = match.parentBlockId
    ? items.find(
        (item) =>
          normalizeSourcePageUrl(item.sourcePageUrl) === normalizedPageUrl &&
          item.blockId === match.parentBlockId,
      )
    : undefined;

  const childPlaceholderKey =
    existingParent && match.parentBlockId
      ? resolveChildPlaceholderKey(
          existingParent.renderingPath,
          match.renderingPath,
          discovery?.renderingProfiles,
        ) ?? undefined
      : undefined;

  const crawlPage = crawl?.pages?.find((entry) => entry.url === match.pageUrl);
  const mappedLanguage = resolveMappedPageLanguage(
    normalizedPageUrl,
    crawlPage?.language,
    {
      instanceLanguages: discovery?.instanceLanguages,
      siteLanguages: discovery?.siteLanguages,
    },
  );
  const defaultLanguages = resolveDefaultPageLanguages(
    normalizedPageUrl,
    [
      ...(crawlPage?.availableLanguages ?? []),
      ...(crawl?.sourceLanguages ?? []),
      ...(crawlPage?.language ? [crawlPage.language] : []),
    ],
    {
      instanceLanguages: discovery?.instanceLanguages,
      siteLanguages: discovery?.siteLanguages,
      pageLanguage: crawlPage?.language,
    },
  );

  const newItem = normalizeQueueItemPaths(
    queueItemFromMatch(match, findBlockImages(match), {
      parentBlockId: match.parentBlockId,
      parentQueueItemId: existingParent?.id,
      childPlaceholderKey,
      language: mappedLanguage,
    }),
  );
  newItem.languages =
    defaultLanguages.length > 0 ? defaultLanguages : [mappedLanguage];
  newItem.primarySourceLanguage = mappedLanguage;
  newItem.sourceAlternateUrls = crawlPage?.alternateUrls;
  newItem.sourcePageUrl = normalizedPageUrl;
  const existingOnPage = items.find(
    (item) =>
      normalizeSourcePageUrl(item.sourcePageUrl) === normalizedPageUrl,
  );
  if (existingOnPage) {
    newItem.targetPagePath = existingOnPage.targetPagePath;
    newItem.placeholder = existingOnPage.placeholder;
    newItem.languages = existingOnPage.languages ?? (
      existingOnPage.language ? [existingOnPage.language] : newItem.languages
    );
    newItem.language =
      existingOnPage.language ?? newItem.languages?.[0] ?? newItem.language;
  }
  items.push(newItem);

  const linked = linkQueueHierarchy(
    applyDiscoveryPlaceholderDefaults(items, discovery?.placeholders),
    discovery?.renderingProfiles,
  );
  saveMigrationQueue(linked);

  return {
    success: true,
    message: "Added to review queue.",
  };
}

export function removeMatchFromQueue(
  match: BlockMatchResult,
): { success: boolean; message: string } {
  const key = queueItemKey(match.blockId, match.pageUrl);
  const items = getMigrationQueue();
  const item = items.find(
    (entry) => queueItemKey(entry.blockId, entry.sourcePageUrl) === key,
  );

  if (!item) {
    return {
      success: false,
      message: "This component is not in the review queue.",
    };
  }

  removeQueueItem(item.id);

  return {
    success: true,
    message: "Removed from review queue.",
  };
}

export function updateQueueItemsForSourcePage(
  sourcePageUrl: string,
  updates: Partial<
    Pick<
      MigrationQueueItem,
      "targetPagePath" | "placeholder" | "language" | "languages"
    >
  >,
): void {
  const normalizedSource = normalizeSourcePageUrl(sourcePageUrl);
  const items = getMigrationQueue().map((item) => {
    if (normalizeSourcePageUrl(item.sourcePageUrl) !== normalizedSource) {
      return item;
    }

    if (updates.targetPagePath !== undefined) {
      const withTarget = applyTargetPageChangeToQueueItem(
        item,
        updates.targetPagePath,
      );
      return {
        ...withTarget,
        placeholder: updates.placeholder ?? withTarget.placeholder,
        languages: updates.languages ?? withTarget.languages,
        language:
          updates.language ??
          updates.languages?.[0] ??
          withTarget.language,
      };
    }

    const next = { ...item, ...updates };
    if (updates.languages) {
      next.language = updates.languages[0] ?? next.language;
    }
    return next;
  });
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
      | "languages"
      | "childPlaceholderKey"
      | "parentQueueItemId"
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
