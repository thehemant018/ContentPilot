import {
  canNestUnderParentRendering,
  childAllowsNestedPresentation,
  childAllowedInParentExposedPlaceholder,
  findRenderingProfile,
} from "@/lib/migration/placeholder-registry";
import { renderingNamesSuggestParentChild } from "@/lib/ai-match/catalog-shape";
import type {
  PlaceholderDefinition,
  RenderingPlaceholderProfile,
} from "@/types/discovery";
import type { MappingEntry } from "@/types/visual-mapper";
import { mappingEntryBlockId } from "@/lib/visual-mapper/template-key";

/**
 * True when `child` targets a node inside `parent` per Visual Mapper selectors.
 */
export function isSelectorDescendant(child: string, parent: string): boolean {
  const normalizedChild = child.trim();
  const normalizedParent = parent.trim();
  if (!normalizedChild || !normalizedParent || normalizedChild === normalizedParent) {
    return false;
  }

  if (normalizedChild.startsWith(normalizedParent)) {
    const nextChar = normalizedChild[normalizedParent.length];
    if (nextChar === undefined || nextChar === " " || nextChar === ">") {
      return true;
    }
  }

  const childParts = normalizedChild.split(/\s*>\s*/);
  const parentParts = normalizedParent.split(/\s*>\s*/);
  if (parentParts.length >= childParts.length) {
    return false;
  }

  for (let index = 0; index <= childParts.length - parentParts.length; index += 1) {
    const segment = childParts.slice(index, index + parentParts.length);
    if (!segment.every((part, partIndex) => part === parentParts[partIndex])) {
      continue;
    }
    return index + parentParts.length < childParts.length;
  }

  return false;
}

function resolveParentBlockId(
  parent: MappingEntry,
  blockIdByEntryId?: Map<string, string>,
): string {
  return blockIdByEntryId?.get(parent.id) ?? mappingEntryBlockId(parent);
}

function canVisualMapperNestUnder(
  parent: MappingEntry,
  child: MappingEntry,
  renderingProfiles?: RenderingPlaceholderProfile[],
  placeholders?: PlaceholderDefinition[],
): boolean {
  if (parent.id === child.id) {
    return false;
  }

  const parentRenderingPath = parent.renderingPath?.trim();
  const childRenderingPath = child.renderingPath?.trim();
  if (
    parentRenderingPath &&
    childRenderingPath &&
    parentRenderingPath === childRenderingPath
  ) {
    return false;
  }

  return canNestUnderParentRendering(
    parent.renderingPath,
    child.renderingPath,
    renderingProfiles,
    {
      parentRenderingName: parent.renderingName,
      childRenderingName: child.renderingName,
      placeholders,
    },
  );
}

function scoreParentCandidate(
  parent: MappingEntry,
  child: MappingEntry,
  renderingProfiles?: RenderingPlaceholderProfile[],
  placeholders?: PlaceholderDefinition[],
): number {
  let score = 0;
  const parentProfile = findRenderingProfile(
    renderingProfiles,
    parent.renderingPath,
  );
  if (
    parentProfile &&
    childAllowedInParentExposedPlaceholder(
      parentProfile,
      child.renderingPath,
      child.renderingName,
      placeholders,
    )
  ) {
    score += 30;
  }
  if (
    renderingNamesSuggestParentChild(
      parent.renderingName ?? "",
      child.renderingName ?? "",
    )
  ) {
    score += 20;
  }
  return score;
}

function pickBestParentCandidate(
  matches: Array<{ candidate: MappingEntry; candidateIndex: number }>,
  childIndex: number,
  child: MappingEntry,
  blockIdByEntryId: Map<string, string> | undefined,
  assignedChildrenCount: Map<string, number>,
  renderingProfiles?: RenderingPlaceholderProfile[],
  placeholders?: PlaceholderDefinition[],
): MappingEntry | undefined {
  if (matches.length === 0) {
    return undefined;
  }

  const longestSelectorLength = Math.max(
    ...matches.map((match) => match.candidate.sourceSelector.length),
  );
  const tiedMatches = matches.filter(
    (match) => match.candidate.sourceSelector.length === longestSelectorLength,
  );
  const precedingMatches = tiedMatches.filter(
    ({ candidateIndex }) => candidateIndex < childIndex,
  );
  const pool = precedingMatches.length > 0 ? precedingMatches : tiedMatches;
  const first = pool[0];
  if (!first) {
    return undefined;
  }

  return pool.reduce((best, current) => {
    const bestBlockId = resolveParentBlockId(best.candidate, blockIdByEntryId);
    const currentBlockId = resolveParentBlockId(
      current.candidate,
      blockIdByEntryId,
    );
    const bestNameScore = scoreParentCandidate(
      best.candidate,
      child,
      renderingProfiles,
      placeholders,
    );
    const currentNameScore = scoreParentCandidate(
      current.candidate,
      child,
      renderingProfiles,
      placeholders,
    );
    if (currentNameScore > bestNameScore) {
      return current;
    }
    if (currentNameScore < bestNameScore) {
      return best;
    }
    const bestCount = assignedChildrenCount.get(bestBlockId) ?? 0;
    const currentCount = assignedChildrenCount.get(currentBlockId) ?? 0;

    if (currentCount < bestCount) {
      return current;
    }
    if (
      currentCount === bestCount &&
      current.candidateIndex < best.candidateIndex
    ) {
      return current;
    }
    return best;
  }, first).candidate;
}

/**
 * Infers parent block ids from nested iframe selectors on the same page.
 * Example: parent `section.cards` → child `section.cards .card-item`.
 */
export function inferVisualMapperParentBlockIds(
  entries: MappingEntry[],
  renderingProfiles?: RenderingPlaceholderProfile[],
  blockIdByEntryId?: Map<string, string>,
  placeholders?: PlaceholderDefinition[],
): Map<string, string> {
  const parentBlockIdByEntryId = new Map<string, string>();
  const assignedChildrenCount = new Map<string, number>();

  for (const [childIndex, child] of entries.entries()) {
    if (
      !childAllowsNestedPresentation(
        child.renderingPath,
        child.renderingName,
        renderingProfiles,
      )
    ) {
      continue;
    }

    const selectorMatches = entries
      .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
      .filter(
        ({ candidate, candidateIndex }) =>
          candidateIndex !== childIndex &&
          candidate.sourcePageUrl === child.sourcePageUrl &&
          isSelectorDescendant(child.sourceSelector, candidate.sourceSelector),
      );

    const selectorParent = pickBestParentCandidate(
      selectorMatches,
      childIndex,
      child,
      blockIdByEntryId,
      assignedChildrenCount,
      renderingProfiles,
      placeholders,
    );

    if (selectorParent) {
      const parentBlockId = resolveParentBlockId(selectorParent, blockIdByEntryId);
      parentBlockIdByEntryId.set(child.id, parentBlockId);
      assignedChildrenCount.set(
        parentBlockId,
        (assignedChildrenCount.get(parentBlockId) ?? 0) + 1,
      );
      continue;
    }

    if (!renderingProfiles?.length) {
      continue;
    }

    const nestingParents = entries
      .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
      .filter(
        ({ candidate, candidateIndex }) =>
          candidateIndex < childIndex &&
          candidate.sourcePageUrl === child.sourcePageUrl &&
          canVisualMapperNestUnder(candidate, child, renderingProfiles, placeholders),
      );

    const nestingParent = pickBestParentCandidate(
      nestingParents,
      childIndex,
      child,
      blockIdByEntryId,
      assignedChildrenCount,
      renderingProfiles,
      placeholders,
    );

    if (!nestingParent) {
      continue;
    }

    const parentBlockId = resolveParentBlockId(nestingParent, blockIdByEntryId);
    parentBlockIdByEntryId.set(child.id, parentBlockId);
    assignedChildrenCount.set(
      parentBlockId,
      (assignedChildrenCount.get(parentBlockId) ?? 0) + 1,
    );
  }

  return parentBlockIdByEntryId;
}
