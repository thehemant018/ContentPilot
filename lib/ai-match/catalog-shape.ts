import { normalizeComponentName } from "@/lib/ai-match/block-keywords";
import type { FlatContentBlock } from "@/types/ai-match";
import type { DiscoveryItem, TemplateDefinition } from "@/types/discovery";

/** How a crawled block relates to a multi-item section in the discovery catalog. */
export type CatalogShapeRole = "container" | "leaf";

const CONTAINER_NAME_PATTERN =
  /list|grid|collection|group|container|carousel|slider|wrapper|stack|listing|row|columns/i;

const LEAF_NAME_PATTERN =
  /item|tile|entry|element|feature|promo|teaser|cell|unit/i;

const IMAGE_FIELD_PATTERN =
  /\b(image|photo|media|thumbnail|picture|banner|icon)\b/i;

export function resolveCatalogShapeRole(
  block: FlatContentBlock,
): CatalogShapeRole | undefined {
  if (block.matchRole === "section-container") {
    return "container";
  }

  if (block.parentBlockId) {
    return "leaf";
  }

  return undefined;
}

function compactName(name: string): string {
  return normalizeComponentName(name).replace(/\s+/g, "");
}

export function nameSuggestsContainer(name: string): boolean {
  return CONTAINER_NAME_PATTERN.test(compactName(name));
}

export function nameSuggestsLeaf(name: string): boolean {
  const compact = compactName(name);

  if (LEAF_NAME_PATTERN.test(compact)) {
    return true;
  }

  return (
    /\bcards?\b/i.test(normalizeComponentName(name)) &&
    !nameSuggestsContainer(name)
  );
}

export function templateHasImageField(template: TemplateDefinition): boolean {
  return template.fields.some((field) => IMAGE_FIELD_PATTERN.test(field.name));
}

export function scoreRenderingCatalogShape(
  block: FlatContentBlock,
  rendering: DiscoveryItem,
): number {
  const role = resolveCatalogShapeRole(block);
  if (!role) {
    return 0;
  }

  const containerHint = nameSuggestsContainer(rendering.name);
  const leafHint = nameSuggestsLeaf(rendering.name);

  if (role === "container") {
    if (containerHint && !leafHint) {
      return 30;
    }
    if (leafHint && !containerHint) {
      return -30;
    }
    if (containerHint && leafHint) {
      return 10;
    }
    return 0;
  }

  if (leafHint && !containerHint) {
    return 30;
  }
  if (containerHint && !leafHint) {
    return -30;
  }
  if (containerHint && leafHint) {
    return -5;
  }

  return 0;
}

export function scoreTemplateCatalogShape(
  block: FlatContentBlock,
  template: TemplateDefinition,
): number {
  const role = resolveCatalogShapeRole(block);
  if (!role) {
    return 0;
  }

  const hasImage = templateHasImageField(template);
  const fieldCount = template.fields.length;
  const nameContainer = nameSuggestsContainer(template.name);
  const nameLeaf = nameSuggestsLeaf(template.name);

  if (role === "container") {
    let score = 0;

    if (!hasImage && fieldCount >= 1 && fieldCount <= 4) {
      score += 25;
    }
    if (hasImage) {
      score -= 20;
    }
    if (nameContainer && !nameLeaf) {
      score += 15;
    }
    if (nameLeaf && !nameContainer) {
      score -= 15;
    }

    return score;
  }

  let score = 0;

  if (hasImage) {
    score += 20;
  }
  if (fieldCount >= 2) {
    score += 5;
  }
  if (nameLeaf && !nameContainer) {
    score += 15;
  }
  if (nameContainer && !nameLeaf) {
    score -= 15;
  }

  return score;
}
