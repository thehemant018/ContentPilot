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
