import { executeGraphQL, isMissingItemLanguageVersionError, SitecoreGraphQLError } from "@/lib/sitecore/graphql-client";
import { formatSitecoreGraphQLItemId } from "@/lib/sitecore/item-service-client";
import { requireItemLanguageVersionBeforeWrite } from "@/lib/sitecore/item-version";

import { getSitecoreItemByPath } from "@/lib/sitecore/item-lookup";
import { resolvePresentationPlaceholder } from "@/lib/sitecore/dynamic-placeholder";
import {
  applyPresentationTreeToLayoutXml,
} from "@/lib/sitecore/presentation-tree";
import {
  DEFAULT_LAYOUT_DEVICE_ID,
  FINAL_RENDERINGS_FIELD,
  SHARED_RENDERINGS_FIELD,
  appendRenderingToLayoutXml,
  buildRenderingElement,
  insertRenderingInLayoutXml,
  layoutContainsRendering,
} from "@/lib/sitecore/layout-xml";
import {
  GET_PAGE_RENDERINGS_FIELD_QUERY,
  UPDATE_ITEM_RENDERINGS_MUTATION,
} from "@/lib/sitecore/presentation-queries";
import type { MigrationComponentExport } from "@/types/migration-export";
import type { RenderingPlaceholderProfile } from "@/types/discovery";

export interface AddRenderingInput {
  itemPath: string;
  renderingPath: string;
  placeHolder: string;
  dataSource: string;
  language: string;
  finalLayout: boolean;
  index?: number;
}

interface PageRenderingsQueryResult {
  item?: {
    itemId?: string;
    path?: string;
    renderingsField?: {
      value?: string | null;
    } | null;
  } | null;
}

interface UpdateItemMutationResult {
  updateItem?: {
    item?: {
      itemId?: string;
      path?: string;
    } | null;
  } | null;
}

async function getPageRenderingsFieldValue(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  language: string,
  fieldName: string,
): Promise<{ itemId: string; value: string }> {
  try {
    const data = await executeGraphQL<PageRenderingsQueryResult>(
      instanceUrl,
      accessToken,
      GET_PAGE_RENDERINGS_FIELD_QUERY,
      { path: itemPath, language, fieldName },
    );

    const item = data.item;
    if (!item?.itemId) {
      throw new Error(`Page item not found at ${itemPath}.`);
    }

    return {
      itemId: item.itemId,
      value: item.renderingsField?.value ?? "",
    };
  } catch (error) {
    if (
      error instanceof SitecoreGraphQLError &&
      isMissingItemLanguageVersionError(error.message)
    ) {
      throw new Error(
        `Page at ${itemPath} has no "${language}" language version. Create the language version before assigning presentation.`,
      );
    }
    throw error;
  }
}

async function updatePageRenderingsFieldValue(
  instanceUrl: string,
  accessToken: string,
  itemId: string,
  language: string,
  fieldName: string,
  layoutXml: string,
): Promise<void> {
  await executeGraphQL<UpdateItemMutationResult>(
    instanceUrl,
    accessToken,
    UPDATE_ITEM_RENDERINGS_MUTATION,
    {
      input: {
        itemId: formatSitecoreGraphQLItemId(itemId),
        language,
        database: "master",
        fields: [{ name: fieldName, value: layoutXml, reset: false }],
      },
    },
  );
}

/**
 * Assigns a rendering on a page by updating the layout field via Authoring GraphQL.
 * XM Cloud does not expose the legacy layout REST endpoints (404).
 */
export async function addRenderingToPage(
  instanceUrl: string,
  accessToken: string,
  input: AddRenderingInput,
): Promise<void> {
  const pagePath = input.itemPath.trim();
  const renderingPath = input.renderingPath.trim();
  const datasourcePath = input.dataSource.trim();
  const language = input.language?.trim() || "en";
  const fieldName = input.finalLayout
    ? FINAL_RENDERINGS_FIELD
    : SHARED_RENDERINGS_FIELD;

  const [renderingItem, datasourceItem] = await Promise.all([
    getSitecoreItemByPath(instanceUrl, accessToken, renderingPath),
    getSitecoreItemByPath(instanceUrl, accessToken, datasourcePath),
  ]);

  if (!renderingItem) {
    throw new Error(`Rendering item not found at ${renderingPath}.`);
  }
  if (!datasourceItem) {
    throw new Error(
      `Datasource item not found at ${datasourcePath}. Push datasource first or check the path.`,
    );
  }

  const { itemId: pageItemId, value: currentLayout } =
    await getPageRenderingsFieldValue(
      instanceUrl,
      accessToken,
      pagePath,
      language,
      fieldName,
    );

  if (
    layoutContainsRendering(
      currentLayout,
      renderingItem.itemId,
      datasourceItem.itemId,
    )
  ) {
    return;
  }

  const resolvedPlaceholder = resolvePresentationPlaceholder(
    input.placeHolder,
    currentLayout,
  );

  const renderingElement = buildRenderingElement({
    renderingId: renderingItem.itemId,
    placeholder: resolvedPlaceholder,
    datasourceId: datasourceItem.itemId,
  });

  const updatedLayout =
    typeof input.index === "number" && input.index >= 0
      ? insertRenderingInLayoutXml(
          currentLayout,
          renderingElement,
          resolvedPlaceholder,
          input.index,
          DEFAULT_LAYOUT_DEVICE_ID,
        )
      : appendRenderingToLayoutXml(
          currentLayout,
          renderingElement,
          DEFAULT_LAYOUT_DEVICE_ID,
        );

  await updatePageRenderingsFieldValue(
    instanceUrl,
    accessToken,
    pageItemId,
    language,
    fieldName,
    updatedLayout,
  );
}

export interface ApplyPresentationTreeInput {
  itemPath: string;
  language: string;
  finalLayout: boolean;
  components: MigrationComponentExport[];
  renderingProfiles?: RenderingPlaceholderProfile[];
}

/**
 * Assigns a tree of renderings on a page in depth-first order with a single
 * layout read/write. Supports nested dynamic placeholders.
 */
export async function applyPresentationTreeToPage(
  instanceUrl: string,
  accessToken: string,
  input: ApplyPresentationTreeInput,
): Promise<{
  assignedCount: number;
  skippedCount: number;
  skipped: Array<{ queueItemId: string; renderingName: string; reason: string }>;
  assigned: Array<{
    queueItemId: string;
    renderingName: string;
    placeholder: string;
  }>;
}> {
  const pagePath = input.itemPath.trim();
  const language = input.language?.trim() || "en";
  const fieldName = input.finalLayout
    ? FINAL_RENDERINGS_FIELD
    : SHARED_RENDERINGS_FIELD;

  const components = input.components.filter(
    (component) => component.presentation.renderingPath?.trim(),
  );

  if (components.length === 0) {
    return { assignedCount: 0, skippedCount: 0, skipped: [], assigned: [] };
  }

  await requireItemLanguageVersionBeforeWrite(
    instanceUrl,
    accessToken,
    pagePath,
    language,
  );

  const renderingPaths = [
    ...new Set(
      components
        .map((component) => component.presentation.renderingPath?.trim())
        .filter(Boolean) as string[],
    ),
  ];
  const datasourcePaths = [
    ...new Set(components.map((component) => component.presentation.dataSource.trim())),
  ];

  const [renderingItems, datasourceItems, layoutState] = await Promise.all([
    Promise.all(
      renderingPaths.map((path) =>
        getSitecoreItemByPath(instanceUrl, accessToken, path),
      ),
    ),
    Promise.all(
      datasourcePaths.map((path) =>
        getSitecoreItemByPath(instanceUrl, accessToken, path),
      ),
    ),
    getPageRenderingsFieldValue(
      instanceUrl,
      accessToken,
      pagePath,
      language,
      fieldName,
    ),
  ]);

  const renderingIdByPath = new Map<string, string>();
  for (let index = 0; index < renderingPaths.length; index += 1) {
    const item = renderingItems[index];
    if (item?.itemId) {
      renderingIdByPath.set(renderingPaths[index]!, item.itemId);
    }
  }

  const datasourceIdByPath = new Map<string, string>();
  for (let index = 0; index < datasourcePaths.length; index += 1) {
    const item = datasourceItems[index];
    if (item?.itemId) {
      datasourceIdByPath.set(datasourcePaths[index]!, item.itemId);
    }
  }

  const { layoutXml, nodes, skipped } = applyPresentationTreeToLayoutXml(
    layoutState.value,
    components,
    renderingIdByPath,
    datasourceIdByPath,
    input.renderingProfiles,
  );

  if (nodes.length === 0) {
    return {
      assignedCount: 0,
      skippedCount: skipped.length,
      skipped,
      assigned: [],
    };
  }

  await updatePageRenderingsFieldValue(
    instanceUrl,
    accessToken,
    layoutState.itemId,
    language,
    fieldName,
    layoutXml,
  );

  return {
    assignedCount: nodes.length,
    skippedCount: skipped.length,
    skipped,
    assigned: nodes.map((node) => ({
      queueItemId: node.component.queueItemId,
      renderingName: node.component.presentation.renderingName,
      placeholder: node.resolvedPlaceholder,
    })),
  };
}
