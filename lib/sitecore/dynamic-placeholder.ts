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
