import { VALIDATE_PATH_QUERY } from "@/lib/sitecore/discovery/queries";
import { normalizeSitecoreItemPath } from "@/lib/migration/target/sitecore-path";
import { executeGraphQL } from "@/lib/sitecore/graphql-client";

export interface SitecoreItemRef {
  itemId: string;
  name: string;
  path: string;
}

export interface SitecoreItemWithTemplate extends SitecoreItemRef {
  templateId?: string;
  templateName?: string;
}

interface ValidatePathGraphResult {
  item?: {
    itemId?: string;
    name?: string;
    path?: string;
    template?: {
      name?: string;
      templateId?: string;
    } | null;
  } | null;
}

export async function getSitecoreItemByPath(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
): Promise<SitecoreItemRef | null> {
  const item = await getSitecoreItemWithTemplate(
    instanceUrl,
    accessToken,
    itemPath,
  );
  if (!item) {
    return null;
  }
  return {
    itemId: item.itemId,
    name: item.name,
    path: item.path,
  };
}

export async function getSitecoreItemWithTemplate(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
): Promise<SitecoreItemWithTemplate | null> {
  const data = await executeGraphQL<ValidatePathGraphResult>(
    instanceUrl,
    accessToken,
    VALIDATE_PATH_QUERY,
    { path: normalizeSitecoreItemPath(itemPath) },
  );

  if (!data.item?.itemId || !data.item.path) {
    return null;
  }

  return {
    itemId: data.item.itemId,
    name: data.item.name ?? "",
    path: data.item.path,
    templateId: data.item.template?.templateId,
    templateName: data.item.template?.name,
  };
}

export async function ensureSitecoreItemExists(
  instanceUrl: string,
  accessToken: string,
  itemPath: string,
  label: string,
): Promise<SitecoreItemRef> {
  const item = await getSitecoreItemByPath(instanceUrl, accessToken, itemPath);
  if (!item) {
    throw new Error(
      `${label} not found at ${itemPath}. For SXA pages, ensure the page's "Data" local datasource item exists under the target page.`,
    );
  }
  return item;
}

/** SXA pages use a "Data" child item (not a folder) as the datasource parent. */
export function buildSxaDatasourceParentPath(pagePath: string): string {
  return `${pagePath.replace(/\/$/, "")}/Data`;
}
