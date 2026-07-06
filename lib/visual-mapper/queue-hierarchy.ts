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

  if (!normalizedChild.startsWith(normalizedParent)) {
    return false;
  }

  const nextChar = normalizedChild[normalizedParent.length];
  return nextChar === undefined || nextChar === " " || nextChar === ">";
}

/**
 * Infers parent block ids from nested iframe selectors on the same page.
 * Example: parent `section.cards` → child `section.cards .card-item`.
 */
export function inferVisualMapperParentBlockIds(
  entries: MappingEntry[],
): Map<string, string> {
  const parentBlockIdByEntryId = new Map<string, string>();

  for (const child of entries) {
    let bestParent: MappingEntry | undefined;
    let longestParentSelector = -1;

    for (const candidate of entries) {
      if (candidate.id === child.id) {
        continue;
      }
      if (candidate.sourcePageUrl !== child.sourcePageUrl) {
        continue;
      }
      if (!isSelectorDescendant(child.sourceSelector, candidate.sourceSelector)) {
        continue;
      }

      if (candidate.sourceSelector.length > longestParentSelector) {
        bestParent = candidate;
        longestParentSelector = candidate.sourceSelector.length;
      }
    }

    if (bestParent) {
      parentBlockIdByEntryId.set(child.id, mappingEntryBlockId(bestParent));
    }
  }

  return parentBlockIdByEntryId;
}
