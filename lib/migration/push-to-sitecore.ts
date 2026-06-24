import fs from "node:fs/promises";
import path from "node:path";
import { resolveMediaFieldsForComponent } from "@/lib/migration/resolve-media-fields";
import {
  ensureSitecoreItemExists,
  getSitecoreItemByPath,
} from "@/lib/sitecore/item-lookup";
import {
  createItem,
  editItemById,
  splitSitecoreItemPath,
} from "@/lib/sitecore/item-service-client";
import {
  normalizeMediaUploadPath,
  type UploadMediaResult,
} from "@/lib/sitecore/media-upload";
import { addRenderingToPage } from "@/lib/sitecore/presentation-client";
import {
  getMigrationDataRoot,
  readLatestExportSummary,
} from "@/lib/migration/write-local-data";
import type {
  MigrationComponentExport,
  MigrationExportManifest,
  MigrationPushComponentResult,
  MigrationPushResult,
} from "@/types/migration-export";

async function loadBatchComponents(
  batchDir: string,
  manifest: MigrationExportManifest,
): Promise<MigrationComponentExport[]> {
  const absoluteBatchDir = path.isAbsolute(batchDir)
    ? batchDir
    : path.join(process.cwd(), batchDir);

  const components: MigrationComponentExport[] = [];

  for (const relativePath of manifest.components) {
    const raw = await fs.readFile(
      path.join(absoluteBatchDir, relativePath),
      "utf8",
    );
    components.push(JSON.parse(raw) as MigrationComponentExport);
  }

  return components;
}

async function resolveDatasourceTemplateId(
  instanceUrl: string,
  accessToken: string,
  templatePath: string | undefined,
  templateName: string,
): Promise<string> {
  const pathsToTry = [
    templatePath?.trim(),
    templateName.startsWith("/sitecore/") ? templateName : undefined,
  ].filter(Boolean) as string[];

  for (const candidatePath of pathsToTry) {
    const item = await getSitecoreItemByPath(
      instanceUrl,
      accessToken,
      candidatePath,
    );
    if (item?.itemId) {
      return item.itemId.replace(/[{}]/g, "");
    }
  }

  throw new Error(
    `Datasource template "${templateName}" was not found. Push uses the matched Sitecore template from Discovery (e.g. Hero at /sitecore/templates/...), not a new template under content.`,
  );
}

async function upsertDatasource(
  instanceUrl: string,
  accessToken: string,
  component: MigrationComponentExport,
  fields: Record<string, string>,
): Promise<{ created: boolean; updated: boolean; path: string }> {
  const language = component.presentation.language || "en";
  const datasourcePath = component.datasource.path;
  const { parentPath, itemName } = splitSitecoreItemPath(datasourcePath);

  await ensureSitecoreItemExists(
    instanceUrl,
    accessToken,
    parentPath,
    "Datasource parent item",
  );

  const existing = await getSitecoreItemByPath(
    instanceUrl,
    accessToken,
    datasourcePath,
  );

  if (existing) {
    await editItemById(
      instanceUrl,
      accessToken,
      existing.itemId,
      fields,
      { language, database: "master" },
    );
    return { created: false, updated: true, path: datasourcePath };
  }

  const templateId = await resolveDatasourceTemplateId(
    instanceUrl,
    accessToken,
    component.datasource.templatePath,
    component.datasource.templateName,
  );

  const created = await createItem(
    instanceUrl,
    accessToken,
    parentPath,
    itemName,
    templateId,
    fields,
    { language, database: "master" },
  );

  if (created.ItemID && Object.keys(fields).length > 0) {
    await editItemById(
      instanceUrl,
      accessToken,
      created.ItemID,
      fields,
      { language, database: "master" },
    );
  }

  return { created: true, updated: false, path: datasourcePath };
}

export async function pushLatestBatchToSitecore(
  instanceUrl: string,
  accessToken: string,
  batchId?: string,
  options?: { mediaLibraryPath?: string },
): Promise<MigrationPushResult> {
  const latest = await readLatestExportSummary();
  if (!latest) {
    return {
      success: false,
      message: "No local export found. Export from Review phase first.",
    };
  }

  if (batchId && batchId !== latest.batchId) {
    return {
      success: false,
      message: `Batch "${batchId}" not found. Latest batch is "${latest.batchId}".`,
    };
  }

  const batchDir = latest.batchDir.startsWith("data")
    ? path.join(process.cwd(), latest.batchDir)
    : path.join(getMigrationDataRoot(), latest.batchId);

  const components = await loadBatchComponents(batchDir, latest.manifest);
  const results: MigrationPushComponentResult[] = [];
  let pushedCount = 0;
  let failedCount = 0;

  const rawMediaPath =
    options?.mediaLibraryPath?.trim() ||
    latest.manifest.mediaLibraryPath?.trim();

  if (!rawMediaPath) {
    return {
      success: false,
      message:
        "Media library path is not set. Configure it in Discovery, then export from Review before pushing.",
    };
  }

  let mediaLibraryPath: string;
  try {
    mediaLibraryPath = normalizeMediaUploadPath(rawMediaPath);
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Invalid media library path from Discovery.",
    };
  }

  const uploadCache = new Map<string, UploadMediaResult>();

  for (const component of components) {
    const result: MigrationPushComponentResult = {
      queueItemId: component.queueItemId,
      datasourcePath: component.datasource.path,
      targetPagePath: component.targetPagePath,
      datasourceCreated: false,
      datasourceUpdated: false,
      presentationAssigned: false,
      mediaUploaded: 0,
      warnings: [],
    };

    try {
      const resolvedFields = await resolveMediaFieldsForComponent(
        instanceUrl,
        accessToken,
        component,
        mediaLibraryPath,
        uploadCache,
      );
      result.mediaUploaded = resolvedFields.uploadedCount;
      result.warnings.push(...resolvedFields.warnings);

      const datasource = await upsertDatasource(
        instanceUrl,
        accessToken,
        component,
        resolvedFields.fields,
      );
      result.datasourceCreated = datasource.created;
      result.datasourceUpdated = datasource.updated;

      const renderingPath = component.presentation.renderingPath?.trim();
      if (!renderingPath) {
        result.warnings.push(
          "Rendering path missing — datasource saved; assign presentation manually.",
        );
        results.push(result);
        pushedCount += 1;
        continue;
      }

      try {
        await addRenderingToPage(instanceUrl, accessToken, {
          itemPath: component.presentation.itemPath,
          renderingPath,
          placeHolder: component.presentation.placeHolder,
          dataSource: component.presentation.dataSource,
          language: component.presentation.language,
          finalLayout: component.presentation.finalLayout,
          index: component.presentation.index,
        });
        result.presentationAssigned = true;
      } catch (presentationError) {
        result.warnings.push(
          presentationError instanceof Error
            ? presentationError.message
            : "Presentation assignment failed.",
        );
      }

      pushedCount += 1;
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Push failed for component.";
      failedCount += 1;
    }

    results.push(result);
  }

  const success = failedCount === 0;
  return {
    success,
    message: success
      ? `Pushed ${pushedCount} component(s) to Sitecore from batch ${latest.batchId}.`
      : `Pushed ${pushedCount} component(s), ${failedCount} failed. See details below.`,
    batchId: latest.batchId,
    results,
    pushedCount,
    failedCount,
  };
}
