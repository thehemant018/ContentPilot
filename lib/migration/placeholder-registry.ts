import {
  nameSuggestsContainer,
  nameSuggestsLeaf,
} from "@/lib/ai-match/catalog-shape";
import type { RenderingPlaceholderProfile } from "@/types/discovery";

function normalizeRenderingPath(path: string): string {
  return path.trim().replace(/\/+$/, "");
}

function normalizePlaceholderKeyForMatch(key: string): string {
  return key.trim().replace(/^\/+/, "");
}

function stripParentPrefixFromAllowedKey(
  allowedKey: string,
  parentAllowedPrefixes: string[],
): string {
  const normalized = normalizePlaceholderKeyForMatch(allowedKey);
  for (const prefix of parentAllowedPrefixes) {
    const parentPrefix = normalizePlaceholderKeyForMatch(prefix);
    if (normalized === parentPrefix) {
      return normalized;
    }
    if (normalized.startsWith(`${parentPrefix}/`)) {
      return normalized.slice(parentPrefix.length + 1);
    }
  }

  if (normalized.includes("/")) {
    return normalized.split("/").pop() ?? normalized;
  }

  return normalized;
}

export function placeholderKeysReferToSameNestedSlot(
  exposedKey: string,
  allowedKey: string,
  parentAllowedPrefixes: string[] = [],
): boolean {
  const exposedNorm = normalizePlaceholderKeyForMatch(exposedKey);
  const allowedNorm = normalizePlaceholderKeyForMatch(allowedKey);

  if (exposedNorm === allowedNorm) {
    return true;
  }

  const allowedStripped = parentAllowedPrefixes.length
    ? stripParentPrefixFromAllowedKey(allowedKey, parentAllowedPrefixes)
    : allowedNorm;

  if (exposedNorm === allowedStripped) {
    return true;
  }

  const toPatternToken = (value: string) =>
    value.replace(/\{\*\}/g, "{*}").replace(/\{id\}/gi, "{id}");

  return toPatternToken(exposedNorm) === toPatternToken(allowedStripped);
}

export function findRenderingProfile(
  profiles: RenderingPlaceholderProfile[] | undefined,
  renderingPath: string | undefined,
): RenderingPlaceholderProfile | undefined {
  if (!profiles?.length || !renderingPath?.trim()) {
    return undefined;
  }

  const normalized = normalizeRenderingPath(renderingPath);
  return profiles.find(
    (profile) => normalizeRenderingPath(profile.renderingPath) === normalized,
  );
}

/**
 * Picks the Sitecore placeholder key pattern for nested presentation
 * (e.g. CardList-Demo-{*}) from Discovery profiles — never from rendering names.
 */
export function pickNestedPlaceholderKeyPattern(input: {
  childPlaceholderKey?: string;
  parentProfile?: RenderingPlaceholderProfile;
  childProfile?: RenderingPlaceholderProfile;
}): string | null {
  const explicit = input.childPlaceholderKey?.trim();
  if (explicit) {
    return explicit;
  }

  const parent = input.parentProfile;
  if (!parent) {
    return null;
  }

  const exposed = parent.exposedChildPlaceholderKeys.filter(Boolean);
  if (exposed.length === 1) {
    return exposed[0]!;
  }

  if (exposed.length > 1 && input.childProfile) {
    const matched = exposed.find((key) =>
      input.childProfile!.allowedParentPlaceholderKeys.some((allowed) =>
        placeholderKeysReferToSameNestedSlot(
          key,
          allowed,
          parent.allowedParentPlaceholderKeys,
        ),
      ),
    );
    if (matched) {
      return matched;
    }
    return exposed[0]!;
  }

  if (input.childProfile) {
    const dynamicAllowed = input.childProfile.allowedParentPlaceholderKeys.filter(
      (key) => key.includes("{*}") || /\{id\}/i.test(key),
    );
    if (dynamicAllowed.length === 1) {
      return stripParentPrefixFromAllowedKey(
        dynamicAllowed[0]!,
        parent.allowedParentPlaceholderKeys,
      );
    }
  }

  return null;
}

/**
 * Resolves the static child placeholder key for a nested component using
 * Sitecore rendering placeholder profiles from Discovery.
 */
export function resolveChildPlaceholderKey(
  parentRenderingPath: string | undefined,
  childRenderingPath: string | undefined,
  profiles: RenderingPlaceholderProfile[] | undefined,
  debugContext?: { childRenderingName?: string; parentRenderingName?: string },
): string | null {
  const parent = findRenderingProfile(profiles, parentRenderingPath);
  const child = findRenderingProfile(profiles, childRenderingPath);

  if (!parent) {
    return null;
  }

  if (!child) {
    if (parent.exposedChildPlaceholderKeys.length === 1) {
      return parent.exposedChildPlaceholderKeys[0]!;
    }
    return null;
  }

  const candidates = parent.exposedChildPlaceholderKeys.filter((key) =>
    child.allowedParentPlaceholderKeys.some((allowed) =>
      placeholderKeysReferToSameNestedSlot(
        key,
        allowed,
        parent.allowedParentPlaceholderKeys,
      ),
    ),
  );

  if (candidates.length === 1) {
    return candidates[0]!;
  }

  if (candidates.length > 1) {
    const childSlug = childRenderingPath!
      .split("/")
      .pop()
      ?.replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase();

    if (childSlug) {
      const semantic = candidates.find((key) =>
        key.toLowerCase().includes(childSlug),
      );
      if (semantic) {
        return semantic;
      }
    }

    return candidates[0]!;
  }

  const allowsNestedUnderParent = child.allowedParentPlaceholderKeys.some(
    (allowed) =>
      parent.exposedChildPlaceholderKeys.some((exposed) =>
        placeholderKeysReferToSameNestedSlot(
          exposed,
          allowed,
          parent.allowedParentPlaceholderKeys,
        ),
      ),
  );

  if (allowsNestedUnderParent && parent.exposedChildPlaceholderKeys.length === 1) {
    return parent.exposedChildPlaceholderKeys[0]!;
  }

  if (parent.exposedChildPlaceholderKeys.length === 1) {
    return parent.exposedChildPlaceholderKeys[0]!;
  }

  return null;
}

/**
 * True when Discovery placeholder keys are missing but SXA profiles still
 * indicate a container parent (e.g. CardList-Demo) and leaf child (CardItem).
 */
export function canNestUnderParentRendering(
  parentRenderingPath: string | undefined,
  childRenderingPath: string | undefined,
  profiles: RenderingPlaceholderProfile[] | undefined,
  names?: { parentRenderingName?: string; childRenderingName?: string },
): boolean {
  if (
    resolveChildPlaceholderKey(
      parentRenderingPath,
      childRenderingPath,
      profiles,
      names,
    )
  ) {
    return true;
  }

  const parent = findRenderingProfile(profiles, parentRenderingPath);
  const child = findRenderingProfile(profiles, childRenderingPath);
  if (!parent || !child) {
    return false;
  }

  const parentName = names?.parentRenderingName || parent.renderingName;
  const childName = names?.childRenderingName || child.renderingName;

  if (!(parent.usesSxaDynamicPlaceholders || parent.hasDynamicPlaceholders)) {
    return false;
  }

  return nameSuggestsContainer(parentName) && nameSuggestsLeaf(childName);
}

/**
 * Resolves child placeholder key for queue linking, including SXA fallbacks
 * when Sitecore multilist keys were not loaded during Discovery.
 */
export function resolveChildPlaceholderKeyForNesting(
  parentRenderingPath: string | undefined,
  childRenderingPath: string | undefined,
  profiles: RenderingPlaceholderProfile[] | undefined,
  debugContext?: { childRenderingName?: string; parentRenderingName?: string },
): string | null {
  const matched = resolveChildPlaceholderKey(
    parentRenderingPath,
    childRenderingPath,
    profiles,
    debugContext,
  );
  if (matched) {
    return matched;
  }

  const parent = findRenderingProfile(profiles, parentRenderingPath);
  const child = findRenderingProfile(profiles, childRenderingPath);
  if (!parent || !child) {
    return null;
  }

  return pickNestedPlaceholderKeyPattern({
    parentProfile: parent,
    childProfile: child,
  });
}

export function listPageRootPlaceholderKeys(
  placeholders: Array<{ key: string }> | undefined,
): string[] {
  if (!placeholders?.length) {
    return [];
  }

  return [...new Set(placeholders.map((entry) => entry.key.trim()).filter(Boolean))].sort();
}

export function pickDefaultPagePlaceholder(
  placeholders: Array<{ key: string }> | undefined,
  fallback: string,
): string {
  const keys = listPageRootPlaceholderKeys(placeholders);
  if (keys.length === 0) {
    return fallback;
  }

  const preferred = keys.find(
    (key) => key === fallback || key.endsWith("-main") || key === "main",
  );
  return preferred ?? keys[0]!;
}
