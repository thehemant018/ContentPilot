import { randomUUID } from "node:crypto";

/** Default layout device used by most Sitecore / SXA pages. */
export const DEFAULT_LAYOUT_DEVICE_ID = "FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3";

export const SHARED_RENDERINGS_FIELD = "__Renderings";
export const FINAL_RENDERINGS_FIELD = "__Final Renderings";

/** Sitecore layout XML expects dashed GUIDs: {512BD825-A5D7-4585-ADF1-D8BBF8844036} */
export function formatSitecoreGuid(id: string): string {
  const hex = id.replace(/[{}-]/g, "").trim().toUpperCase();
  if (hex.length !== 32 || !/^[0-9A-F]+$/.test(hex)) {
    return `{${hex}}`;
  }

  const dashed = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return `{${dashed}}`;
}

export function buildRenderingElement(input: {
  renderingId: string;
  placeholder: string;
  datasourceId: string;
  uid?: string;
}): string {
  const uid = formatSitecoreGuid(input.uid ?? randomUUID());
  const renderingId = formatSitecoreGuid(input.renderingId);
  const datasourceId = formatSitecoreGuid(input.datasourceId);
  const placeholder = input.placeholder.trim() || "main";

  return `<r uid="${uid}" s:id="${renderingId}" s:ph="${placeholder}" s:ds="${datasourceId}" s:par="" s:ccb="Clear on publish" />`;
}

export function buildInitialLayoutXml(
  deviceId: string,
  renderingElement: string,
): string {
  return `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${formatSitecoreGuid(deviceId)}">${renderingElement}</d></r>`;
}

export function appendRenderingToLayoutXml(
  existingXml: string | undefined,
  renderingElement: string,
  deviceId: string = DEFAULT_LAYOUT_DEVICE_ID,
): string {
  const trimmed = existingXml?.trim();
  if (!trimmed) {
    return buildInitialLayoutXml(deviceId, renderingElement);
  }

  const deviceToken = `id="${formatSitecoreGuid(deviceId)}"`;
  const deviceIndex = trimmed.indexOf(deviceToken);
  if (deviceIndex === -1) {
    const insertAt = trimmed.lastIndexOf("</r>");
    if (insertAt === -1) {
      return buildInitialLayoutXml(deviceId, renderingElement);
    }
    const deviceBlock = `<d id="${formatSitecoreGuid(deviceId)}">${renderingElement}</d>`;
    return `${trimmed.slice(0, insertAt)}${deviceBlock}${trimmed.slice(insertAt)}`;
  }

  const deviceClose = trimmed.indexOf("</d>", deviceIndex);
  if (deviceClose === -1) {
    return buildInitialLayoutXml(deviceId, renderingElement);
  }

  return `${trimmed.slice(0, deviceClose)}${renderingElement}${trimmed.slice(deviceClose)}`;
}

export function layoutContainsRendering(
  layoutXml: string | undefined,
  renderingId: string,
  datasourceId: string,
): boolean {
  if (!layoutXml?.trim()) {
    return false;
  }

  const renderingToken = `s:id="${formatSitecoreGuid(renderingId)}"`;
  const datasourceToken = `s:ds="${formatSitecoreGuid(datasourceId)}"`;
  return layoutXml.includes(renderingToken) && layoutXml.includes(datasourceToken);
}
