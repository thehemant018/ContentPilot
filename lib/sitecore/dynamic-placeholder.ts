/**
 * Resolves SXA / Sitecore dynamic placeholder keys when assigning presentation.
 *
 * Base keys such as `headless-main` are what users configure in Review. At push
 * time we read the page layout and map that base key to the actual placeholder
 * used on the page (for example a partial-design `sig` like
 * `headless-main-{rendering-uid}-1`).
 *
 * @see https://doc.sitecore.com/xp/en/developers/104/sitecore-experience-manager/dynamic-placeholders.html
 */

import { formatSitecoreGuid } from "@/lib/sitecore/layout-xml";
import type { NestedPlaceholderFormat } from "@/types/discovery";

/** Sitecore mvc.getDynamicPlaceholderInitialKey suffix pattern. */
const SITECORE_GUID_DYNAMIC_SUFFIX =
  /-\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}-\d+$/i;

const RENDERING_TAG_REGEX = /<r\s([^>]+?)\s*\/>/gi;
const ATTRIBUTE_REGEX = /([\w:]+)="([^"]*)"/g;

export interface LayoutRendering {
  uid: string;
  renderingId: string;
  placeholder: string;
  datasourceId: string;
  parameters: string;
}

export function normalizePlaceholderKey(value: string): string {
  return value.trim().replace(/^\/+/, "");
}

export function getDynamicPlaceholderBaseKey(placeholder: string): string {
  const normalized = normalizePlaceholderKey(placeholder);
  if (SITECORE_GUID_DYNAMIC_SUFFIX.test(normalized)) {
    return normalized.replace(SITECORE_GUID_DYNAMIC_SUFFIX, "");
  }
  return normalized;
}

export function isDynamicPlaceholderForBase(
  placeholder: string,
  basePlaceholder: string,
): boolean {
  const base = normalizePlaceholderKey(basePlaceholder);
  const candidate = normalizePlaceholderKey(placeholder);

  if (candidate === base) {
    return true;
  }

  if (candidate.startsWith(`${base}/`)) {
    return true;
  }

  return candidate.startsWith(`${base}-`);
}

export function parseRenderingParameters(
  parameters: string | undefined,
): Record<string, string> {
  if (!parameters?.trim()) {
    return {};
  }

  const decoded = parameters.replace(/&amp;/g, "&").replace(/^&+/, "");
  const params: Record<string, string> = {};

  for (const part of decoded.split("&")) {
    if (!part) {
      continue;
    }
    const separator = part.indexOf("=");
    if (separator === -1) {
      params[part] = "";
      continue;
    }
    const key = part.slice(0, separator);
    const rawValue = part.slice(separator + 1);
    try {
      params[key] = decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch {
      params[key] = rawValue;
    }
  }

  return params;
}

export function extractRenderingsFromLayout(
  layoutXml: string | undefined,
): LayoutRendering[] {
  if (!layoutXml?.trim()) {
    return [];
  }

  const renderings: LayoutRendering[] = [];

  for (const match of layoutXml.matchAll(RENDERING_TAG_REGEX)) {
    const attrs = parseRenderingAttributes(match[1] ?? "");
    const placeholder = attrs["s:ph"]?.trim();
    if (!placeholder) {
      continue;
    }

    renderings.push({
      uid: attrs.uid ?? "",
      renderingId: attrs["s:id"] ?? "",
      placeholder,
      datasourceId: attrs["s:ds"] ?? "",
      parameters: attrs["s:par"] ?? "",
    });
  }

  return renderings;
}

function parseRenderingAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of attrString.matchAll(ATTRIBUTE_REGEX)) {
    attrs[match[1]!] = match[2] ?? "";
  }
  return attrs;
}

function findPartialDesignSigPlaceholder(
  basePlaceholder: string,
  renderings: LayoutRendering[],
): string | undefined {
  for (const rendering of renderings) {
    if (rendering.placeholder !== basePlaceholder) {
      continue;
    }

    const params = parseRenderingParameters(rendering.parameters);
    const sig = params.sig?.trim();
    if (sig && (sig === basePlaceholder || sig.startsWith(`${basePlaceholder}-`))) {
      return normalizePlaceholderKey(sig);
    }
  }

  return undefined;
}

function collectDynamicPlaceholderCandidates(
  basePlaceholder: string,
  renderings: LayoutRendering[],
): string[] {
  const candidates = new Set<string>();

  for (const rendering of renderings) {
    if (isDynamicPlaceholderForBase(rendering.placeholder, basePlaceholder)) {
      candidates.add(normalizePlaceholderKey(rendering.placeholder));
    }
  }

  return Array.from(candidates);
}

function pickBestDynamicPlaceholder(
  candidates: string[],
  renderings: LayoutRendering[],
): string {
  const counts = new Map<string, number>();
  for (const rendering of renderings) {
    const key = normalizePlaceholderKey(rendering.placeholder);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...candidates].sort((left, right) => {
    const countDiff = (counts.get(right) ?? 0) - (counts.get(left) ?? 0);
    if (countDiff !== 0) {
      return countDiff;
    }
    return right.length - left.length;
  })[0]!;
}

/** Path-based nested placeholder: headless-main/CardList-2 */
const PATH_NESTED_PLACEHOLDER_PATTERN = /\/[^/]+-\d+$/;

/**
 * Converts a Sitecore rendering name to the path segment used in nested
 * placeholders (e.g. "Card List" → "CardList").
 */
export function toRenderingPlaceholderSegment(renderingName: string): string {
  return renderingName
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Resolves Sitecore placeholder key patterns with dynamic id wildcards.
 * Example: CardList-Demo-{*} + 1 → CardList-Demo-1
 */
export function resolveDynamicPlaceholderKeyPattern(
  pattern: string,
  dynamicPlaceholderId: number | string,
): string {
  const trimmed = pattern.trim().replace(/^\/+/, "");
  if (/\{\*\}|\{id\}/i.test(trimmed)) {
    return trimmed
      .replace(/\{\*\}/g, String(dynamicPlaceholderId))
      .replace(/\{id\}/gi, String(dynamicPlaceholderId));
  }

  return `${trimmed}-${dynamicPlaceholderId}`;
}

/**
 * Prefix used to scan layout XML for existing nested dynamic placeholders.
 * Example: headless-main/CardList-Demo-
 */
export function buildNestedPlaceholderKeyPrefix(
  parentResolvedPlaceholder: string,
  nestedPlaceholderKeyPattern: string,
): string {
  const resolved = normalizePlaceholderKey(
    buildPathBasedNestedPlaceholderKey(
      parentResolvedPlaceholder,
      nestedPlaceholderKeyPattern,
      1,
    ),
  );
  return resolved.endsWith("-1") ? resolved.slice(0, -1) : `${resolved}-`;
}

/**
 * Builds headless-style nested placeholder keys for layout XML (s:ph):
 * `/{parentPlaceholder}/{resolvedPattern}`
 * Example: /headless-main/CardList-Demo-1 from CardList-Demo-{*}
 */
export function buildPathBasedNestedPlaceholderKey(
  parentResolvedPlaceholder: string,
  nestedPlaceholderKeyPattern: string,
  dynamicPlaceholderId: number | string,
): string {
  const pattern = nestedPlaceholderKeyPattern.trim();
  const resolved = resolveDynamicPlaceholderKeyPattern(
    pattern,
    dynamicPlaceholderId,
  );

  if (resolved.includes("/")) {
    return resolved.startsWith("/") ? resolved : `/${resolved}`;
  }

  const parentKey = normalizePlaceholderKey(parentResolvedPlaceholder);
  return `/${parentKey}/${resolved}`;
}

export function isPathBasedNestedPlaceholder(placeholder: string): boolean {
  return PATH_NESTED_PLACEHOLDER_PATTERN.test(
    normalizePlaceholderKey(placeholder),
  );
}

/**
 * Picks the next DynamicPlaceholderId for a parent rendering on a page.
 * Scans existing layout placeholders matching `{parentPh}/{Name}-{id}`.
 */
export function allocateDynamicPlaceholderId(
  layoutXml: string | undefined,
  parentResolvedPlaceholder: string,
  nestedPlaceholderKeyPattern: string,
  defaultId: number = 1,
): number {
  const prefix = buildNestedPlaceholderKeyPrefix(
    parentResolvedPlaceholder,
    nestedPlaceholderKeyPattern,
  );

  let maxId = 0;
  for (const rendering of extractRenderingsFromLayout(layoutXml)) {
    const placeholder = normalizePlaceholderKey(rendering.placeholder);
    if (placeholder.startsWith(prefix)) {
      const suffix = placeholder.slice(prefix.length);
      const parsed = Number.parseInt(suffix, 10);
      if (!Number.isNaN(parsed)) {
        maxId = Math.max(maxId, parsed);
      }
    }

    const params = parseRenderingParameters(rendering.parameters);
    const paramId = Number.parseInt(
      params.DynamicPlaceholderId ??
        params.dynamicplaceholderid ??
        params.DynamicPlaceholderID ??
        "",
      10,
    );
    if (!Number.isNaN(paramId)) {
      maxId = Math.max(maxId, paramId);
    }
  }

  if (maxId > 0) {
    return maxId + 1;
  }

  return defaultId;
}

export function readDynamicPlaceholderIdFromParameters(
  parameters: string | undefined,
): number | undefined {
  const params = parseRenderingParameters(parameters);
  const raw =
    params.DynamicPlaceholderId ??
    params.dynamicplaceholderid ??
    params.DynamicPlaceholderID;
  if (!raw?.trim()) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Reads DynamicPlaceholderId from a nested s:ph path using the Sitecore
 * placeholder key pattern (e.g. CardList-Demo-{*}).
 */
export function readDynamicPlaceholderIdFromNestedPath(
  placeholder: string,
  nestedPlaceholderKeyPattern: string,
): number | undefined {
  const template = nestedPlaceholderKeyPattern.trim().replace(/^\/+/, "");
  if (!template) {
    return undefined;
  }

  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{\\\*\\\}/g, "(\\d+)")
    .replace(/\\\{id\\\}/gi, "(\\d+)");

  const hasWildcard = /\{\*\}|\{id\}/i.test(template);
  const suffixPattern = hasWildcard
    ? escaped
    : `${escaped}-(\\d+)`;
  const pathSuffix = template.includes("/")
    ? suffixPattern
    : `.*/${suffixPattern}`;

  const normalized = normalizePlaceholderKey(placeholder);
  const match = normalized.match(new RegExp(`${pathSuffix}$`, "i"));
  if (!match?.[1]) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function buildGuidSuffixNestedPlaceholderKey(
  childPlaceholderKey: string,
  parentRenderingUid: string,
  dynamicPlaceholderId: number | string = 1,
): string {
  const baseKey = normalizePlaceholderKey(childPlaceholderKey);
  const uid = formatSitecoreGuid(parentRenderingUid);
  return `${baseKey}-${uid}-${dynamicPlaceholderId}`;
}

/** @deprecated Use buildGuidSuffixNestedPlaceholderKey or buildPathBasedNestedPlaceholderKey */
export function buildDynamicPlaceholderKey(
  parentResolvedPlaceholder: string,
  parentRenderingUid: string,
  dynamicPlaceholderId: number | string = 1,
): string {
  return buildGuidSuffixNestedPlaceholderKey(
    parentResolvedPlaceholder,
    parentRenderingUid,
    dynamicPlaceholderId,
  );
}

export function buildNestedChildPlaceholderKey(input: {
  format: NestedPlaceholderFormat;
  parentResolvedPlaceholder: string;
  parentRenderingName: string;
  parentRenderingUid: string;
  childPlaceholderKey: string;
  dynamicPlaceholderId: number;
}): string {
  if (input.format === "path-suffix") {
    return buildPathBasedNestedPlaceholderKey(
      input.parentResolvedPlaceholder,
      input.childPlaceholderKey,
      input.dynamicPlaceholderId,
    );
  }

  return buildGuidSuffixNestedPlaceholderKey(
    input.childPlaceholderKey,
    input.parentRenderingUid,
    input.dynamicPlaceholderId,
  );
}

/**
 * Maps a user-configured base placeholder to the key that should be written
 * into layout XML for the next rendering on that page.
 */
export function resolvePresentationPlaceholder(
  basePlaceholder: string,
  layoutXml: string | undefined,
): string {
  const base = normalizePlaceholderKey(basePlaceholder);
  if (!base) {
    return base;
  }

  const renderings = extractRenderingsFromLayout(layoutXml);
  if (renderings.length === 0) {
    return base;
  }

  const sigPlaceholder = findPartialDesignSigPlaceholder(base, renderings);
  if (sigPlaceholder) {
    return sigPlaceholder;
  }

  const placeholders = new Set(
    renderings.map((rendering) =>
      normalizePlaceholderKey(rendering.placeholder),
    ),
  );

  if (placeholders.has(base)) {
    return base;
  }

  const dynamicCandidates = collectDynamicPlaceholderCandidates(
    base,
    renderings,
  );
  if (dynamicCandidates.length > 0) {
    return pickBestDynamicPlaceholder(dynamicCandidates, renderings);
  }

  return base;
}
