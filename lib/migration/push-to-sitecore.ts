import { expandQueueItemsForLanguages } from "@/lib/migration/expand-queue-languages";
import { localizeExpandedQueueItems } from "@/lib/migration/localized-queue-fields";
import { DEFAULT_MIGRATION_LANGUAGE } from "@/lib/migration/constants";
import { pagePresentationKey } from "@/lib/migration/page-presentation-key";
import { resolveQueueLanguages, compareMigrationLanguageOrder } from "@/lib/migration/language-mapping";
import { sortComponentsForPresentationTree } from "@/lib/sitecore/presentation-tree";
import {
  buildComponentsFromQueue,
  prepareQueueForMigration,
} from "@/lib/migration/queue-sync";
import { resolveLinkFieldsForComponent } from "@/lib/migration/resolve-link-fields";
import { resolveMediaFieldsForComponent } from "@/lib/migration/resolve-media-fields";
import { normalizeSitecoreItemPath } from "@/lib/migration/sitecore-path";
import { ensureTargetPagesExist, resolveQueueTargetPagePaths } from "@/lib/migration/target-page";
import { ensurePageLanguageContext } from "@/lib/migration/page-language-context";
import {
  ensureSitecoreItemExists,
  getSitecoreItemByPath,
} from "@/lib/sitecore/item-lookup";
import {
  ensureItemsLanguageVersions,
  requireItemLanguageVersionBeforeWrite,
  resolveExistingItemAtPath,
} from "@/lib/sitecore/item-version";
import { resolveVersionSourceLanguages } from "@/lib/migration/version-source-languages";
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
import type { CrawledPage } from "@/types/crawl";

function sortComponentsByMigrationLanguage(
  components: MigrationComponentExport[],
): MigrationComponentExport[] {
  const languages = [
    ...new Set(
      components.map(
        (component) =>
          component.presentation.language || DEFAULT_MIGRATION_LANGUAGE,
      ),
    ),
  ].sort(compareMigrationLanguageOrder);

  const ordered: MigrationComponentExport[] = [];
  for (const language of languages) {
    const inLanguage = components.filter(
      (component) =>
        (component.presentation.language || DEFAULT_MIGRATION_LANGUAGE) ===
        language,
    );
    ordered.push(...sortComponentsForPresentationTree(inLanguage));
  }

  return ordered;
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
  options?: {
    sxaPageDataTemplatePath?: string;
    sourceLanguages?: string[];
  },
): Promise<{ created: boolean; updated: boolean; path: string }> {
  const language = component.presentation.language || "en";
  const versionSources = resolveVersionSourceLanguages(
    language,
    options?.sourceLanguages ?? [],
  );
  const datasourcePath = component.datasource.path;
  const { parentPath, itemName } = splitSitecoreItemPath(datasourcePath);
  const versionOptions = { sourceLanguages: versionSources };

  // 1. Check page + Data folder have the target language version before writing content.
  await ensurePageLanguageContext(
    instanceUrl,
    accessToken,
    component.targetPagePath,
    language,
    {
      sourceLanguages: versionSources,
      sxaPageDataTemplatePath: options?.sxaPageDataTemplatePath,
    },
  );

  await ensureSitecoreItemExists(
    instanceUrl,
    accessToken,
    parentPath,
    "Datasource parent item",
  );

  // 2. Check datasource language version; create version if item exists in another language.
  const datasourceVersion = await requireItemLanguageVersionBeforeWrite(
    instanceUrl,
    accessToken,
    datasourcePath,
    language,
    versionOptions,
  );

  if (datasourceVersion.status === "ready") {
    await editItemById(
      instanceUrl,
      accessToken,
      datasourceVersion.itemId,
      fields,
      { language, database: "master" },
    );
    return {
      created: false,
      updated: true,
      path: datasourcePath,
    };
  }

  const existingInAnotherLanguage = await resolveExistingItemAtPath(
    instanceUrl,
    accessToken,
    datasourcePath,
    versionSources,
  );
  if (existingInAnotherLanguage) {
    const ensuredVersion = await requireItemLanguageVersionBeforeWrite(
      instanceUrl,
      accessToken,
      datasourcePath,
      language,
      versionOptions,
    );
    if (ensuredVersion.status !== "ready") {
      throw new Error(
        `Datasource exists at ${datasourcePath} but "${language}" version could not be created.`,
      );
    }

    await editItemById(
      instanceUrl,
      accessToken,
      ensuredVersion.itemId,
      fields,
      { language, database: "master" },
    );
    return {
      created: false,
      updated: true,
      path: datasourcePath,
    };
  }

  const parentVersion = await requireItemLanguageVersionBeforeWrite(
    instanceUrl,
    accessToken,
    parentPath,
    language,
    versionOptions,
  );
  if (parentVersion.status === "item-not-found") {
    throw new Error(
      `Datasource parent not found at ${parentPath} for language "${language}".`,
    );
  }

  // Brand-new datasource — create in target language, then write content.
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
  /** Crawled source pages — used to resolve localized field content at push time. */
  sourcePages?: CrawledPage[];
}

export async function pushQueueToSitecore(
  instanceUrl: string,
  accessToken: string,
  options: PushQueueToSitecoreOptions,
): Promise<MigrationPushResult> {
  const baseQueue = prepareQueueForMigration(options.queue, {
    placeholders: options.placeholders,
    renderingProfiles: options.renderingProfiles,
  });
  const languagesByQueueId = new Map(
    baseQueue.map((item) => [item.id, resolveQueueLanguages(item)]),
  );
  let preparedQueue = expandQueueItemsForLanguages(baseQueue);
  const localization = await localizeExpandedQueueItems(
    preparedQueue,
    options.sourcePages ?? [],
  );
  preparedQueue = localization.queue;
  const localizationWarnings = localization.warningsByComponentKey;

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

  const languageGroups = new Map<
    string,
    { language: string; paths: string[] }
  >();

  for (const item of preparedQueue) {
    const language = item.language?.trim() || DEFAULT_MIGRATION_LANGUAGE;
    const path = normalizeSitecoreItemPath(item.targetPagePath);
    const group = languageGroups.get(language) ?? {
      language,
      paths: [],
    };
    if (!group.paths.includes(path)) {
      group.paths.push(path);
    }
    languageGroups.set(language, group);
  }

  let pathByRequested: Record<string, string> = {};

  try {
    if (options.createMissingPages) {
      const sortedLanguageGroups = [...languageGroups.values()].sort((a, b) =>
        compareMigrationLanguageOrder(a.language, b.language),
      );
      for (const group of sortedLanguageGroups) {
        const pageResolution = await ensureTargetPagesExist(
          instanceUrl,
          accessToken,
          group.paths,
          {
            language: group.language,
            pageTemplatePath: options.pageTemplatePath,
            sxaPageDataTemplatePath: options.sxaPageDataTemplatePath,
          },
        );
        const failedPage = pageResolution.results.find((entry) => entry.error);
        if (failedPage?.error) {
          throw new Error(failedPage.error);
        }
        pathByRequested = {
          ...pathByRequested,
          ...pageResolution.pathByRequested,
        };
      }
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
    skipLanguageExpansion: true,
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

  const componentsByPageLanguage = new Map<string, MigrationComponentExport[]>();
  for (const component of components) {
    const key = pagePresentationKey(
      component.targetPagePath,
      component.presentation.language || DEFAULT_MIGRATION_LANGUAGE,
    );
    const group = componentsByPageLanguage.get(key) ?? [];
    group.push(component);
    componentsByPageLanguage.set(key, group);
  }
  for (const [key, pageComponents] of componentsByPageLanguage) {
    componentsByPageLanguage.set(
      key,
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

  function componentPushKey(component: MigrationComponentExport): string {
    return `${component.queueItemId}::${component.presentation.language || DEFAULT_MIGRATION_LANGUAGE}`;
  }

  // Phase 1 — create/update all datasources (base language first, parents before children).
  const datasourceOrder = sortComponentsByMigrationLanguage(components);
  for (const component of datasourceOrder) {
    const componentLanguage =
      component.presentation.language || DEFAULT_MIGRATION_LANGUAGE;
    const result: MigrationPushComponentResult = {
      queueItemId: component.queueItemId,
      language: componentLanguage,
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
    const localizationWarning = localizationWarnings.get(componentPushKey(component));
    if (localizationWarning) {
      result.warnings.push(localizationWarning);
    }

    try {
      const versionSourcesForComponent = resolveVersionSourceLanguages(
        componentLanguage,
        languagesByQueueId.get(component.queueItemId) ?? [],
      );

      // Ensure page + Data folder language versions exist before resolving media/links.
      await ensurePageLanguageContext(
        instanceUrl,
        accessToken,
        component.targetPagePath,
        componentLanguage,
        {
          sourceLanguages: versionSourcesForComponent,
          sxaPageDataTemplatePath: options.sxaPageDataTemplatePath,
        },
      );

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
        {
          sxaPageDataTemplatePath: options.sxaPageDataTemplatePath,
          sourceLanguages: versionSourcesForComponent,
        },
      );
      result.datasourceCreated = datasource.created;
      result.datasourceUpdated = datasource.updated;

      const renderingPath = component.presentation.renderingPath?.trim();
      if (!renderingPath) {
        result.warnings.push(
          "Rendering path missing — datasource saved; assign presentation manually.",
        );
      }

      componentResults.set(componentPushKey(component), result);
      pushedCount += 1;
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Push failed for component.";
      failedCount += 1;
      componentResults.set(componentPushKey(component), result);
    }
  }

  // Phase 2 — assign presentation per page/language after every datasource exists.
  const sortedPageLanguageKeys = [...componentsByPageLanguage.keys()].sort(
    (a, b) => {
      const languageA = a.slice(a.lastIndexOf("::") + 2);
      const languageB = b.slice(b.lastIndexOf("::") + 2);
      return compareMigrationLanguageOrder(languageA, languageB);
    },
  );
  for (const pageLanguageKey of sortedPageLanguageKeys) {
    const pageComponents = componentsByPageLanguage.get(pageLanguageKey);
    if (!pageComponents) {
      continue;
    }
    if (presentationResults.has(pageLanguageKey)) {
      continue;
    }

    const renderable = pageComponents.filter((component) =>
      component.presentation.renderingPath?.trim(),
    );
    if (renderable.length === 0) {
      presentationResults.set(pageLanguageKey, {
        assigned: false,
        warningsByQueueId: new Map(),
        assignedQueueIds: new Set(),
      });
      continue;
    }

    const lead = renderable[0]!;
    const language = lead.presentation.language || DEFAULT_MIGRATION_LANGUAGE;
    const versionSources = resolveVersionSourceLanguages(
      language,
      languagesByQueueId.get(lead.queueItemId) ?? [],
    );
    const warningsByQueueId = new Map<string, string[]>();
    let assigned = false;
    const assignedQueueIds = new Set<string>();

    try {
      await ensurePageLanguageContext(
        instanceUrl,
        accessToken,
        lead.presentation.itemPath,
        language,
        {
          sourceLanguages: versionSources,
          sxaPageDataTemplatePath: options.sxaPageDataTemplatePath,
        },
      );

      await ensureItemsLanguageVersions(
        instanceUrl,
        accessToken,
        renderable.map((component) => component.datasource.path),
        language,
        { sourceLanguages: versionSources },
      );

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

    presentationResults.set(pageLanguageKey, {
      assigned,
      warningsByQueueId,
      assignedQueueIds,
    });
  }

  for (const component of components) {
    const result =
      componentResults.get(componentPushKey(component)) ??
      ({
        queueItemId: component.queueItemId,
        language:
          component.presentation.language || DEFAULT_MIGRATION_LANGUAGE,
        sourcePageUrl: component.sourcePageUrl,
        datasourcePath: component.datasource.path,
        targetPagePath: component.targetPagePath,
        datasourceCreated: false,
        datasourceUpdated: false,
        presentationAssigned: false,
        warnings: [],
      } satisfies MigrationPushComponentResult);

    const presentation = presentationResults.get(
      pagePresentationKey(
        component.targetPagePath,
        component.presentation.language || DEFAULT_MIGRATION_LANGUAGE,
      ),
    );
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
