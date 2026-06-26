import { randomUUID } from "node:crypto";

import { DEFAULT_PRESENTATION_PLACEHOLDER } from "@/lib/migration/constants";

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
  const placeholder =
    input.placeholder.trim() || DEFAULT_PRESENTATION_PLACEHOLDER;

  return `<r uid="${uid}" s:id="${renderingId}" s:ph="${placeholder}" s:ds="${datasourceId}" s:par="" s:ccb="Clear on publish" />`;
}

export function buildInitialLayoutXml(
  deviceId: string,
  renderingElement: string,
): string {
  return `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${formatSitecoreGuid(deviceId)}">${renderingElement}</d></r>`;
}

function splitDeviceRenderings(deviceInnerXml: string): string[] {
  const elements: string[] = [];
  for (const match of deviceInnerXml.matchAll(/<r\s[^>]+\/>/gi)) {
    elements.push(match[0]!);
  }
  return elements;
}

export function insertRenderingInLayoutXml(
  existingXml: string | undefined,
  renderingElement: string,
  placeholder: string,
  index: number,
  deviceId: string = DEFAULT_LAYOUT_DEVICE_ID,
): string {
  const trimmed = existingXml?.trim();
  if (!trimmed) {
    return buildInitialLayoutXml(deviceId, renderingElement);
  }

  const deviceToken = `id="${formatSitecoreGuid(deviceId)}"`;
  const deviceOpen = trimmed.indexOf(deviceToken);
  if (deviceOpen === -1) {
    return appendRenderingToLayoutXml(
      existingXml,
      renderingElement,
      deviceId,
    );
  }

  const innerStart = trimmed.indexOf(">", deviceOpen) + 1;
  const deviceClose = trimmed.indexOf("</d>", innerStart);
  if (deviceClose === -1) {
    return appendRenderingToLayoutXml(
      existingXml,
      renderingElement,
      deviceId,
    );
  }

  const deviceInner = trimmed.slice(innerStart, deviceClose);
  const renderings = splitDeviceRenderings(deviceInner);
  const normalizedPlaceholder = placeholder.trim();
  const samePlaceholderIndexes = renderings
    .map((element, elementIndex) =>
      element.includes(`s:ph="${normalizedPlaceholder}"`)
        ? elementIndex
        : -1,
    )
    .filter((elementIndex) => elementIndex >= 0);

  const insertAt =
    samePlaceholderIndexes.length === 0
      ? renderings.length
      : samePlaceholderIndexes[
          Math.min(index, samePlaceholderIndexes.length)
        ]!;

  renderings.splice(insertAt, 0, renderingElement);
  const rebuiltInner = renderings.join("");
  return `${trimmed.slice(0, innerStart)}${rebuiltInner}${trimmed.slice(deviceClose)}`;
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
