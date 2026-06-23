import { buildSxaDatasourceParentPath } from "@/lib/sitecore/item-lookup";
import type {
  MigrationComponentExport,
  MigrationPagePresentationExport,
} from "@/types/migration-export";
import type { MigrationQueueItem } from "@/types/migration-queue";

const DEFAULT_PLACEHOLDER = "main";
const DEFAULT_LANGUAGE = "en";

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

export function buildComponentExport(
  item: MigrationQueueItem,
  index: number,
  exportedAt: string,
): MigrationComponentExport | null {
  const targetPagePath = item.targetPagePath.trim();
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
    });
  }

  return {
    queueItemId: item.id,
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
      placeHolder: item.placeholder?.trim() || DEFAULT_PLACEHOLDER,
      dataSource: dataSourcePath,
      finalLayout: false,
      language: item.language?.trim() || DEFAULT_LANGUAGE,
      index,
    },
  };
}

export function groupPresentationByPage(
  components: MigrationComponentExport[],
): MigrationPagePresentationExport[] {
  const byPage = new Map<string, MigrationPagePresentationExport>();

  for (const component of components) {
    const key = component.targetPagePath;
    const existing = byPage.get(key);
    if (existing) {
      existing.renderings.push(component.presentation);
      continue;
    }

    byPage.set(key, {
      targetPagePath: key,
      language: component.presentation.language,
      renderings: [component.presentation],
    });
  }

  return Array.from(byPage.values()).sort((a, b) =>
    a.targetPagePath.localeCompare(b.targetPagePath),
  );
}

export function pageFileKey(targetPagePath: string): string {
  return sanitizePathSegment(targetPagePath.replace(/\//g, "-")) || "page";
}
