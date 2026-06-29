import { executeGraphQL } from "@/lib/sitecore/graphql-client";
import { getSitecoreItemByPath } from "@/lib/sitecore/item-lookup";
import { resolvePresentationPlaceholder } from "@/lib/sitecore/dynamic-placeholder";
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
        itemId: itemId.replace(/[{}]/g, ""),
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
