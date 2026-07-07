import type { RenderingPlaceholderProfile } from "@/types/discovery";
import type { MigrationQueueItem } from "@/types/migration-queue";
import {
  pickDefaultPagePlaceholder,
  resolveChildPlaceholderKeyForNesting,
  findRenderingProfile,
} from "@/lib/migration/placeholder-registry";

function isAncestor(
  ancestorId: string,
  descendantId: string,
  byId: Map<string, MigrationQueueItem>,
): boolean {
  let current = byId.get(descendantId);
  const visited = new Set<string>();

  while (current?.parentQueueItemId) {
    if (current.parentQueueItemId === ancestorId) {
      return true;
    }
    if (visited.has(current.id)) {
      break;
    }
    visited.add(current.id);
    current = byId.get(current.parentQueueItemId);
  }

  return false;
}

function inferParentFromRenderingProfiles(
  item: MigrationQueueItem,
  pageItems: MigrationQueueItem[],
  byId: Map<string, MigrationQueueItem>,
  renderingProfiles?: RenderingPlaceholderProfile[],
): { parentQueueItemId: string; childPlaceholderKey: string } | undefined {
  const matches: Array<{
    parentQueueItemId: string;
    childPlaceholderKey: string;
    score: number;
  }> = [];

  for (const candidate of pageItems) {
    if (candidate.id === item.id) {
      continue;
    }
    if (isAncestor(item.id, candidate.id, byId)) {
      continue;
    }

    const childPlaceholderKey = resolveChildPlaceholderKeyForNesting(
      candidate.renderingPath,
      item.renderingPath,
      renderingProfiles,
      {
        childRenderingName: item.renderingName,
        parentRenderingName: candidate.renderingName,
      },
    );
    if (!childPlaceholderKey) {
      continue;
    }

    const parentProfile = findRenderingProfile(
      renderingProfiles,
      candidate.renderingPath,
    );
    let score = 1;
    if ((parentProfile?.exposedChildPlaceholderKeys.length ?? 0) > 0) {
      score += 2;
    }
    if (parentProfile?.hasDynamicPlaceholders) {
      score += 1;
    }
    if (parentProfile?.usesSxaDynamicPlaceholders) {
      score += 2;
    }

    matches.push({
      parentQueueItemId: candidate.id,
      childPlaceholderKey,
      score,
    });
  }

  if (matches.length === 0) {
    return undefined;
  }

  matches.sort((left, right) => right.score - left.score);
  const best = matches[0]!;
  return {
    parentQueueItemId: best.parentQueueItemId,
    childPlaceholderKey: best.childPlaceholderKey,
  };
}

function computeDepth(
  item: MigrationQueueItem,
  byId: Map<string, MigrationQueueItem>,
  stack: Set<string> = new Set(),
): number {
  if (!item.parentQueueItemId) {
    return 0;
  }

  if (stack.has(item.id)) {
    return 0;
  }

  const parent = byId.get(item.parentQueueItemId);
  if (!parent) {
    return 0;
  }

  stack.add(item.id);
  return computeDepth(parent, byId, stack) + 1;
}

export function linkQueueHierarchy(
  queue: MigrationQueueItem[],
  renderingProfiles?: RenderingPlaceholderProfile[],
): MigrationQueueItem[] {
  const byId = new Map(queue.map((item) => [item.id, item]));
  const byBlockOnPage = new Map<string, MigrationQueueItem>();

  for (const item of queue) {
    byBlockOnPage.set(`${item.sourcePageUrl}::${item.blockId}`, item);
  }

  const withParents = queue.map((item) => {
    let next: MigrationQueueItem = { ...item };

    if (!next.parentQueueItemId && next.parentBlockId) {
      const parent = byBlockOnPage.get(
        `${next.sourcePageUrl}::${next.parentBlockId}`,
      );
      if (parent) {
        next = { ...next, parentQueueItemId: parent.id };
      }
    }

    if (next.parentQueueItemId) {
      const parent = byId.get(next.parentQueueItemId);
      if (parent && !next.childPlaceholderKey) {
        const childKey = resolveChildPlaceholderKeyForNesting(
          parent.renderingPath,
          next.renderingPath,
          renderingProfiles,
        );
        if (childKey) {
          next = { ...next, childPlaceholderKey: childKey };
        }
      }
    }

    return next;
  });

  const byPage = new Map<string, MigrationQueueItem[]>();
  for (const item of withParents) {
    const pageItems = byPage.get(item.sourcePageUrl) ?? [];
    pageItems.push(item);
    byPage.set(item.sourcePageUrl, pageItems);
  }

  const withInferredParents = withParents.map((item) => {
    if (item.parentQueueItemId) {
      return item;
    }

    const inferred = inferParentFromRenderingProfiles(
      item,
      byPage.get(item.sourcePageUrl) ?? [],
      byId,
      renderingProfiles,
    );
    if (!inferred) {
      return item;
    }

    return {
      ...item,
      parentQueueItemId: inferred.parentQueueItemId,
      childPlaceholderKey: item.childPlaceholderKey ?? inferred.childPlaceholderKey,
    };
  });

  const linkedById = new Map(withInferredParents.map((item) => [item.id, item]));
  const siblingCounts = new Map<string, number>();

  return withInferredParents.map((item) => {
    const depth = computeDepth(item, linkedById);
    let presentationSiblingIndex = item.presentationSiblingIndex;
    let dynamicPlaceholderId = item.dynamicPlaceholderId;

    if (item.parentQueueItemId) {
      const siblingKey = item.parentQueueItemId;
      const siblingIndex = siblingCounts.get(siblingKey) ?? 0;
      siblingCounts.set(siblingKey, siblingIndex + 1);
      presentationSiblingIndex = siblingIndex;
    } else {
      const hasChildren = withInferredParents.some(
        (candidate) => candidate.parentQueueItemId === item.id,
      );
      if (hasChildren && dynamicPlaceholderId === undefined) {
        const profile = findRenderingProfile(renderingProfiles, item.renderingPath);
        if (profile?.defaultDynamicPlaceholderId !== undefined) {
          dynamicPlaceholderId = profile.defaultDynamicPlaceholderId;
        }
      }
    }

    return {
      ...item,
      presentationDepth: depth,
      presentationSiblingIndex,
      dynamicPlaceholderId: dynamicPlaceholderId ?? 1,
    };
  });
}

export function applyDiscoveryPlaceholderDefaults(
  queue: MigrationQueueItem[],
  placeholders?: Array<{ key: string }>,
  fallbackPlaceholder: string = "headless-main",
): MigrationQueueItem[] {
  const defaultPlaceholder = pickDefaultPagePlaceholder(
    placeholders,
    fallbackPlaceholder,
  );

  return queue.map((item) => {
    if (item.parentQueueItemId || (item.presentationDepth ?? 0) > 0) {
      return item;
    }

    return {
      ...item,
      placeholder: item.placeholder?.trim() || defaultPlaceholder,
    };
  });
}
