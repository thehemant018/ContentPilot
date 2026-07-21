import {
  DEFAULT_MIGRATION_LANGUAGE,
  DEFAULT_PRESENTATION_PLACEHOLDER,
} from "@/lib/migration/constants";
import {
  findRenderingProfile,
  pickNestedPlaceholderKeyPattern,
} from "@/lib/migration/target/placeholder-registry";
import { normalizeSitecoreItemPath } from "@/lib/migration/target/sitecore-path";
import { buildSxaDatasourceParentPath } from "@/lib/sitecore/item-lookup";
import { resolveNestedDynamicPresentationPlaceholder } from "@/lib/sitecore/rendering-parameters";
import type { RenderingPlaceholderProfile } from "@/types/discovery";
import type {
  MigrationComponentExport,
} from "@/types/migration-export";
import type { MigrationQueueItem } from "@/types/migration-queue";

const DEFAULT_PLACEHOLDER = DEFAULT_PRESENTATION_PLACEHOLDER;
const DEFAULT_LANGUAGE = DEFAULT_MIGRATION_LANGUAGE;

export function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export function buildDatasourceItemName(item: MigrationQueueItem): string {
  const base = sanitizePathSegment(
    item.renderingName || item.templateName || item.blockType,
  );
  if (!base) {
    return `component-${item.id.slice(0, 8)}`;
  }
  return `${base}-${item.id.slice(0, 8)}`;
}

export function buildDatasourcePath(item: MigrationQueueItem): string {
  const override = item.datasourcePath?.trim();
  if (override) {
    return override;
  }

  const pageBase = item.targetPagePath.replace(/\/$/, "");
  const dataParent = buildSxaDatasourceParentPath(pageBase);
  return `${dataParent}/${buildDatasourceItemName(item)}`;
}

export function buildDatasourceName(item: MigrationQueueItem): string {
  return item.renderingName || item.templateName || item.blockType;
}

export interface BuildComponentExportOptions {
  queueItemsById?: Map<string, MigrationQueueItem>;
  renderingProfiles?: RenderingPlaceholderProfile[];
}

/**
 * Resolves the layout placeholder key written at push time.
 * Root components use the page placeholder (e.g. headless-main).
 * Nested children use Sitecore dynamic placeholder paths
 * (e.g. headless-main/CardList-1).
 */
export function resolveExportPresentationPlaceholder(
  item: MigrationQueueItem,
  queueItemsById: Map<string, MigrationQueueItem>,
  renderingProfiles?: RenderingPlaceholderProfile[],
  visiting: Set<string> = new Set(),
): string {
  if (!item.parentQueueItemId) {
    return item.placeholder?.trim() || DEFAULT_PLACEHOLDER;
  }

  if (visiting.has(item.id)) {
    return item.childPlaceholderKey?.trim() || item.placeholder?.trim() || DEFAULT_PLACEHOLDER;
  }

  const parent = queueItemsById.get(item.parentQueueItemId);
  if (!parent) {
    return item.childPlaceholderKey?.trim() || item.placeholder?.trim() || DEFAULT_PLACEHOLDER;
  }

  visiting.add(item.id);
  const parentResolvedPlaceholder = resolveExportPresentationPlaceholder(
    parent,
    queueItemsById,
    renderingProfiles,
    visiting,
  );
  visiting.delete(item.id);

  const parentProfile = findRenderingProfile(
    renderingProfiles,
    parent.renderingPath,
  );
  const childProfile = findRenderingProfile(
    renderingProfiles,
    item.renderingPath,
  );
  const childPlaceholderKey = pickNestedPlaceholderKeyPattern({
    childPlaceholderKey: item.childPlaceholderKey,
    parentProfile,
    childProfile,
  });
  if (!childPlaceholderKey) {
    return item.placeholder?.trim() || DEFAULT_PLACEHOLDER;
  }
  const parentDynamicPlaceholderId =
    parent.dynamicPlaceholderId ??
    parentProfile?.defaultDynamicPlaceholderId ??
    1;

  return resolveNestedDynamicPresentationPlaceholder({
    parentProfile,
    childProfile,
    parentResolvedPlaceholder,
    parentRenderingName:
      parent.renderingName || parentProfile?.renderingName || "",
    parentRenderingUid: "",
    parentDynamicPlaceholderId,
    childPlaceholderKey,
  });
}

export function buildComponentExport(
  item: MigrationQueueItem,
  index: number,
  exportedAt: string,
  options?: BuildComponentExportOptions,
): MigrationComponentExport | null {
  const targetPagePath = normalizeSitecoreItemPath(item.targetPagePath);
  if (!targetPagePath) {
    return null;
  }

  const dataSourcePath = buildDatasourcePath(item);
  const fields: Record<string, string> = {};
  const fieldMeta: MigrationComponentExport["datasource"]["fieldMeta"] = [];

  for (const field of item.fields) {
    const name = field.sitecoreField.trim();
    if (!name) {
      continue;
    }
    fields[name] = field.value;
    fieldMeta.push({
      name,
      type: field.fieldType,
      section: field.section,
      sourceRegion: field.sourceRegion,
      imageAlt: field.imageAlt?.trim() || undefined,
    });
  }

  const queueItemsById =
    options?.queueItemsById ?? new Map([[item.id, item]]);
  const resolvedPlaceholder = resolveExportPresentationPlaceholder(
    item,
    queueItemsById,
    options?.renderingProfiles,
  );

  return {
    queueItemId: item.id,
    blockId: item.blockId,
    exportedAt,
    blockType: item.blockType,
    blockHeading: item.blockHeading,
    sourcePageUrl: item.sourcePageUrl,
    targetPagePath,
    matchScore: item.matchScore,
    confidence: item.confidence,
    datasource: {
      name: buildDatasourceName(item),
      path: dataSourcePath,
      templateName: item.templateName,
      templatePath: item.templatePath,
      fields,
      fieldMeta,
    },
    presentation: {
      itemPath: targetPagePath,
      renderingName: item.renderingName,
      renderingPath: item.renderingPath,
      placeHolder: resolvedPlaceholder,
      dataSource: dataSourcePath,
      finalLayout: false,
      language: item.language?.trim() || DEFAULT_LANGUAGE,
      index,
      parentQueueItemId: item.parentQueueItemId,
      childPlaceholderKey: item.childPlaceholderKey,
      presentationDepth: item.presentationDepth,
      presentationSiblingIndex: item.presentationSiblingIndex,
      dynamicPlaceholderId: item.dynamicPlaceholderId,
    },
  };
}
