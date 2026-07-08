/** Stable component id for bulk apply and review queue deduplication. */
export function componentTemplateKey(
  renderingName: string,
  sourceSelector: string,
): string {
  return `${renderingName}::${sourceSelector}`;
}

export function mappingEntryBlockId(entry: {
  id: string;
  templateKey?: string;
}): string {
  return entry.templateKey?.trim() || entry.id;
}

/** Ensures duplicate template keys on one page get distinct queue block ids. */
export function resolveEntryBlockIds(
  entries: Array<{ id: string; templateKey?: string }>,
): Map<string, string> {
  const blockIdByEntryId = new Map<string, string>();
  const usageCount = new Map<string, number>();

  for (const entry of entries) {
    const base = mappingEntryBlockId(entry);
    const count = usageCount.get(base) ?? 0;
    usageCount.set(base, count + 1);
    blockIdByEntryId.set(entry.id, count === 0 ? base : `${base}::${entry.id}`);
  }

  return blockIdByEntryId;
}
