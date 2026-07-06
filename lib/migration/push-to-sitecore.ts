import { sortComponentsForPresentationTree } from "@/lib/sitecore/presentation-tree";
import {
  buildComponentsFromQueue,
  prepareQueueForMigration,
} from "@/lib/migration/queue-sync";
import { resolveLinkFieldsForComponent } from "@/lib/migration/resolve-link-fields";
import { resolveMediaFieldsForComponent } from "@/lib/migration/resolve-media-fields";
import { normalizeSitecoreItemPath } from "@/lib/migration/sitecore-path";
import { ensureTargetPagesExist, resolveQueueTargetPagePaths } from "@/lib/migration/target-page";
import { ensureSxaPageDataItem } from "@/lib/migration/sxa-page-structure";
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
import {
  applyPresentationTreeToPage,
} from "@/lib/sitecore/presentation-client";
import type {
  MigrationComponentExport,
  MigrationPushComponentResult,
  MigrationPushResult,
} from "@/types/migration-export";
import type { MigrationQueueItem } from "@/types/migration-queue";
import type {
  PlaceholderDefinition,
  RenderingPlaceholderProfile,
} from "@/types/discovery";

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
  options?: { sxaPageDataTemplatePath?: string },
): Promise<{ created: boolean; updated: boolean; path: string }> {
  const language = component.presentation.language || "en";
  const datasourcePath = component.datasource.path;
  const { parentPath, itemName } = splitSitecoreItemPath(datasourcePath);

  await ensureSxaPageDataItem(
    instanceUrl,
    accessToken,
    component.targetPagePath,
    {
      language,
      sxaPageDataTemplatePath: options?.sxaPageDataTemplatePath,
    },
  );

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

export interface PushQueueToSitecoreOptions {
  mediaLibraryPath: string;
  queue: MigrationQueueItem[];
  createMissingPages?: boolean;
  pageTemplatePath?: string;
  sxaPageDataTemplatePath?: string;
  placeholders?: PlaceholderDefinition[];
  renderingProfiles?: RenderingPlaceholderProfile[];
}

export async function pushQueueToSitecore(
  instanceUrl: string,
  accessToken: string,
  options: PushQueueToSitecoreOptions,
): Promise<MigrationPushResult> {
  let preparedQueue = prepareQueueForMigration(options.queue, {
    placeholders: options.placeholders,
    renderingProfiles: options.renderingProfiles,
  });

  if (preparedQueue.length === 0) {
    return {
      success: false,
      message: "Review queue is empty. Add components in AI Match first.",
    };
  }

  const missingTargets = preparedQueue.filter(
    (item) => !item.targetPagePath.trim(),
  );
  if (missingTargets.length > 0) {
    return {
      success: false,
      message: `${missingTargets.length} queued component(s) are missing a target Sitecore page path. Set paths in Review (Phase 5) before pushing.`,
    };
  }

  const requestedTargetPaths = [
    ...new Set(
      preparedQueue
        .map((item) => normalizeSitecoreItemPath(item.targetPagePath))
        .filter(Boolean),
    ),
  ];

  const language =
    preparedQueue.find((item) => item.language?.trim())?.language?.trim() ||
    "en";

  let pathByRequested: Record<string, string>;

  try {
    if (options.createMissingPages) {
      const pageResolution = await ensureTargetPagesExist(
        instanceUrl,
        accessToken,
        requestedTargetPaths,
        {
          language,
          pageTemplatePath: options.pageTemplatePath,
          sxaPageDataTemplatePath: options.sxaPageDataTemplatePath,
        },
      );
      pathByRequested = pageResolution.pathByRequested;
    } else {
      pathByRequested = await resolveQueueTargetPagePaths(
        instanceUrl,
        accessToken,
        requestedTargetPaths,
      );
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : options.createMissingPages
            ? "Failed to create missing target pages."
            : "Failed to resolve target page paths.",
    };
  }

  preparedQueue = preparedQueue.map((item) => {
    const requested = normalizeSitecoreItemPath(item.targetPagePath);
    return {
      ...item,
      targetPagePath: pathByRequested[requested] ?? item.targetPagePath,
    };
  });

  const rawMediaPath = options.mediaLibraryPath.trim();
  if (!rawMediaPath) {
    return {
      success: false,
      message:
        "Media library path is not set. Configure it in Discovery (Phase 2) before pushing.",
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

  const exportedAt = new Date().toISOString();
  const components = buildComponentsFromQueue(preparedQueue, exportedAt, {
    placeholders: options.placeholders,
    renderingProfiles: options.renderingProfiles,
  });

  if (components.length === 0) {
    return {
      success: false,
      message: "No components could be built from the Review queue.",
    };
  }

  const results: MigrationPushComponentResult[] = [];
  let pushedCount = 0;
  let failedCount = 0;

  const uploadCache = new Map<string, UploadMediaResult>();
  const folderSearchCache = new Map<
    string,
    Array<{ itemId: string; name: string; path: string }>
  >();

  const componentsByPath = new Map<string, MigrationComponentExport[]>();
  for (const component of components) {
    const pagePath = component.targetPagePath;
    const group = componentsByPath.get(pagePath) ?? [];
    group.push(component);
    componentsByPath.set(pagePath, group);
  }
  for (const [pagePath, pageComponents] of componentsByPath) {
    componentsByPath.set(
      pagePath,
      sortComponentsForPresentationTree(pageComponents),
    );
  }

  const presentationResults = new Map<
    string,
    {
      assigned: boolean;
      warningsByQueueId: Map<string, string[]>;
      assignedQueueIds: Set<string>;
    }
  >();

  const componentResults = new Map<string, MigrationPushComponentResult>();

  // Phase 1 — create/update all datasources (parents before children in tree order).
  const datasourceOrder = sortComponentsForPresentationTree(components);
  for (const component of datasourceOrder) {
    const result: MigrationPushComponentResult = {
      queueItemId: component.queueItemId,
      sourcePageUrl: component.sourcePageUrl,
      datasourcePath: component.datasource.path,
      targetPagePath: component.targetPagePath,
      datasourceCreated: false,
      datasourceUpdated: false,
      presentationAssigned: false,
      mediaUploaded: 0,
      mediaReused: 0,
      warnings: [],
    };

    try {
      const resolvedMedia = await resolveMediaFieldsForComponent(
        instanceUrl,
        accessToken,
        component,
        mediaLibraryPath,
        uploadCache,
        folderSearchCache,
      );
      result.mediaUploaded = resolvedMedia.uploadedCount;
      result.mediaReused = resolvedMedia.reusedCount;
      result.warnings.push(...resolvedMedia.warnings);

      const resolvedLinks = await resolveLinkFieldsForComponent(
        instanceUrl,
        accessToken,
        {
          ...component,
          datasource: {
            ...component.datasource,
            fields: resolvedMedia.fields,
          },
        },
      );
      result.warnings.push(...resolvedLinks.warnings);

      const datasource = await upsertDatasource(
        instanceUrl,
        accessToken,
        component,
        resolvedLinks.fields,
        { sxaPageDataTemplatePath: options.sxaPageDataTemplatePath },
      );
      result.datasourceCreated = datasource.created;
      result.datasourceUpdated = datasource.updated;

      const renderingPath = component.presentation.renderingPath?.trim();
      if (!renderingPath) {
        result.warnings.push(
          "Rendering path missing — datasource saved; assign presentation manually.",
        );
      }

      componentResults.set(component.queueItemId, result);
      pushedCount += 1;
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Push failed for component.";
      failedCount += 1;
      componentResults.set(component.queueItemId, result);
    }
  }

  // Phase 2 — assign presentation per page after every datasource exists.
  for (const [pagePath, pageComponents] of componentsByPath) {
    if (presentationResults.has(pagePath)) {
      continue;
    }

    const renderable = pageComponents.filter((component) =>
      component.presentation.renderingPath?.trim(),
    );
    if (renderable.length === 0) {
      presentationResults.set(pagePath, {
        assigned: false,
        warningsByQueueId: new Map(),
        assignedQueueIds: new Set(),
      });
      continue;
    }

    const lead = renderable[0]!;
    const warningsByQueueId = new Map<string, string[]>();
    let assigned = false;
    const assignedQueueIds = new Set<string>();

    try {
      const treeResult = await applyPresentationTreeToPage(
        instanceUrl,
        accessToken,
        {
          itemPath: lead.presentation.itemPath,
          language: lead.presentation.language,
          finalLayout: lead.presentation.finalLayout,
          components: renderable,
          renderingProfiles: options.renderingProfiles,
        },
      );
      assigned = treeResult.assignedCount > 0;
      for (const node of treeResult.assigned) {
        assignedQueueIds.add(node.queueItemId);
        warningsByQueueId.set(node.queueItemId, [
          `Placed at placeholder "${node.placeholder}"`,
        ]);
      }
      for (const skip of treeResult.skipped) {
        warningsByQueueId.set(skip.queueItemId, [skip.reason]);
      }
    } catch (presentationError) {
      const message =
        presentationError instanceof Error
          ? presentationError.message
          : "Presentation assignment failed.";
      for (const component of renderable) {
        warningsByQueueId.set(component.queueItemId, [message]);
      }
    }

    presentationResults.set(pagePath, {
      assigned,
      warningsByQueueId,
      assignedQueueIds,
    });
  }

  for (const component of components) {
    const result =
      componentResults.get(component.queueItemId) ??
      ({
        queueItemId: component.queueItemId,
        sourcePageUrl: component.sourcePageUrl,
        datasourcePath: component.datasource.path,
        targetPagePath: component.targetPagePath,
        datasourceCreated: false,
        datasourceUpdated: false,
        presentationAssigned: false,
        warnings: [],
      } satisfies MigrationPushComponentResult);

    const presentation = presentationResults.get(component.targetPagePath);
    if (presentation) {
      result.presentationAssigned = presentation.assignedQueueIds.has(
        component.queueItemId,
      );
      const presentationWarnings =
        presentation.warningsByQueueId.get(component.queueItemId) ?? [];
      result.warnings.push(...presentationWarnings);
    }

    results.push(result);
  }

  const success = failedCount === 0;
  return {
    success,
    message: success
      ? `Pushed ${pushedCount} component(s) to Sitecore from your Review queue.`
      : `Pushed ${pushedCount} component(s), ${failedCount} failed. See details below.`,
    results,
    pushedCount,
    failedCount,
  };
}
