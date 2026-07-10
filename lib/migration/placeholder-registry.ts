import {
  nameSuggestsContainer,
  nameSuggestsLeaf,
  renderingNamesSuggestParentChild,
} from "@/lib/ai-match/catalog-shape";
import type {
  PlaceholderDefinition,
  RenderingPlaceholderProfile,
} from "@/types/discovery";

function normalizeRenderingName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeRenderingPathForMatch(path: string): string {
  return normalizeRenderingPath(path).toLowerCase();
}

export function findPlaceholderSettingsForKey(
  placeholders: PlaceholderDefinition[] | undefined,
  placeholderKey: string,
): PlaceholderDefinition[] {
  if (!placeholders?.length || !placeholderKey.trim()) {
    return [];
  }

  return placeholders.filter((setting) =>
    placeholderKeysReferToSameNestedSlot(placeholderKey, setting.key),
  );
}

export function placeholderSettingAllowsRendering(
  setting: PlaceholderDefinition,
  childRenderingPath: string | undefined,
  childRenderingName: string | undefined,
): boolean {
  const allowedPaths = setting.allowedRenderingPaths ?? [];
  const allowedNames = setting.allowedRenderingNames ?? [];
  if (allowedPaths.length === 0 && allowedNames.length === 0) {
    return false;
  }

  const childPath = childRenderingPath?.trim();
  const childName = childRenderingName?.trim();
  if (!childPath && !childName) {
    return false;
  }

  if (
    childPath &&
    allowedPaths.some(
      (allowed) =>
        normalizeRenderingPathForMatch(allowed) ===
        normalizeRenderingPathForMatch(childPath),
    )
  ) {
    return true;
  }

  if (!childName) {
    return false;
  }

  const normalizedChildName = normalizeRenderingName(childName);
  return allowedNames.some(
    (allowed) => normalizeRenderingName(allowed) === normalizedChildName,
  );
}

function resolveChildPlaceholderKeyFromPlaceholderSettings(input: {
  parentProfile: RenderingPlaceholderProfile;
  childRenderingPath?: string;
  childRenderingName?: string;
  placeholders?: PlaceholderDefinition[];
}): string | null {
  if (!input.placeholders?.length) {
    return null;
  }

  const matches = input.parentProfile.exposedChildPlaceholderKeys.filter(
    (exposedKey) =>
      findPlaceholderSettingsForKey(input.placeholders, exposedKey).some(
        (setting) =>
          placeholderSettingAllowsRendering(
            setting,
            input.childRenderingPath,
            input.childRenderingName,
          ),
      ),
  );

  if (matches.length === 1) {
    return matches[0]!;
  }

  if (matches.length > 1 && input.childRenderingName) {
    const childSlug = input.childRenderingName
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase();
    const semantic = matches.find((key) => key.toLowerCase().includes(childSlug));
    if (semantic) {
      return semantic;
    }
    return matches[0]!;
  }

  return null;
}

export function childAllowedInParentExposedPlaceholder(
  parentProfile: RenderingPlaceholderProfile,
  childRenderingPath: string | undefined,
  childRenderingName: string | undefined,
  placeholders?: PlaceholderDefinition[],
): boolean {
  return Boolean(
    resolveChildPlaceholderKeyFromPlaceholderSettings({
      parentProfile,
      childRenderingPath,
      childRenderingName,
      placeholders,
    }),
  );
}

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

function childProfileAllowsParentPlaceholder(
  childProfile: RenderingPlaceholderProfile,
  parentProfile: RenderingPlaceholderProfile,
  exposedKey: string,
): boolean {
  return childProfile.allowedParentPlaceholderKeys.some((allowed) =>
    placeholderKeysReferToSameNestedSlot(
      exposedKey,
      allowed,
      parentProfile.allowedParentPlaceholderKeys,
    ),
  );
}

/**
 * True when Discovery loaded child placeholder keys from Sitecore
 * (Placeholders, Placeholder Settings, or Layout Service Placeholders).
 */
export function profileExposesChildPlaceholders(
  profile: RenderingPlaceholderProfile | undefined,
): boolean {
  return (profile?.exposedChildPlaceholderKeys ?? []).some((key) =>
    Boolean(key?.trim()),
  );
}

function isDistinctParentChildPair(
  parent: RenderingPlaceholderProfile,
  child: RenderingPlaceholderProfile,
): boolean {
  const parentPath = normalizeRenderingPath(parent.renderingPath);
  const childPath = normalizeRenderingPath(child.renderingPath);
  return Boolean(parentPath && childPath && parentPath !== childPath);
}

/** True when a rendering is expected to live in a parent's nested placeholder. */
export function childAllowsNestedPresentation(
  childRenderingPath: string | undefined,
  childRenderingName: string | undefined,
  profiles?: RenderingPlaceholderProfile[],
): boolean {
  const name = childRenderingName?.trim() ?? "";
  if (nameSuggestsLeaf(name)) {
    return true;
  }

  const childProfile = findRenderingProfile(profiles, childRenderingPath);
  if (!childProfile?.allowedParentPlaceholderKeys.length) {
    return false;
  }

  return childProfile.allowedParentPlaceholderKeys.some(
    (key) => key.includes("{*}") || /\{id\}/i.test(key),
  );
}

/**
 * Picks the Sitecore placeholder key pattern for nested presentation
 * (e.g. CardList-Demo-{*}) from Discovery rendering profiles.
 */
export function pickNestedPlaceholderKeyPattern(input: {
  childPlaceholderKey?: string;
  parentProfile?: RenderingPlaceholderProfile;
  childProfile?: RenderingPlaceholderProfile;
  childRenderingPath?: string;
  childRenderingName?: string;
  placeholders?: PlaceholderDefinition[];
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
  const childPath = input.childProfile?.renderingPath ?? input.childRenderingPath;
  const childName = input.childProfile?.renderingName ?? input.childRenderingName;

  const fromPlaceholderSettings = resolveChildPlaceholderKeyFromPlaceholderSettings({
    parentProfile: parent,
    childRenderingPath: childPath,
    childRenderingName: childName,
    placeholders: input.placeholders,
  });
  if (fromPlaceholderSettings) {
    return fromPlaceholderSettings;
  }

  if (exposed.length === 1) {
    const key = exposed[0]!;
    const child = input.childProfile;
    if (!child) {
      return key;
    }
    if (childProfileAllowsParentPlaceholder(child, parent, key)) {
      return key;
    }
    if (
      profileExposesChildPlaceholders(parent) &&
      isDistinctParentChildPair(parent, child) &&
      renderingNamesSuggestParentChild(parent.renderingName, child.renderingName)
    ) {
      return key;
    }
    if (
      nameSuggestsContainer(parent.renderingName) &&
      nameSuggestsLeaf(child.renderingName) &&
      renderingNamesSuggestParentChild(parent.renderingName, child.renderingName)
    ) {
      return key;
    }
    return null;
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
    if (
      renderingNamesSuggestParentChild(
        parent.renderingName,
        input.childProfile.renderingName,
      ) &&
      childAllowsNestedPresentation(
        input.childProfile.renderingPath,
        input.childProfile.renderingName,
        [parent, input.childProfile],
      )
    ) {
      return exposed[0]!;
    }
    return null;
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
  debugContext?: {
    childRenderingName?: string;
    parentRenderingName?: string;
    placeholders?: PlaceholderDefinition[];
  },
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

  const fromPlaceholderSettings = resolveChildPlaceholderKeyFromPlaceholderSettings({
    parentProfile: parent,
    childRenderingPath,
    childRenderingName: debugContext?.childRenderingName ?? child.renderingName,
    placeholders: debugContext?.placeholders,
  });
  if (fromPlaceholderSettings) {
    return fromPlaceholderSettings;
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

  return null;
}

/**
 * True when Discovery profiles indicate a parent exposes nested placeholders
 * (Layout Service Placeholders / Placeholders) or legacy name heuristics match.
 */
export function canNestUnderParentRendering(
  parentRenderingPath: string | undefined,
  childRenderingPath: string | undefined,
  profiles: RenderingPlaceholderProfile[] | undefined,
  names?: {
    parentRenderingName?: string;
    childRenderingName?: string;
    placeholders?: PlaceholderDefinition[];
  },
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

  if (
    childAllowedInParentExposedPlaceholder(
      parent,
      childRenderingPath,
      names?.childRenderingName ?? child.renderingName,
      names?.placeholders,
    )
  ) {
    return true;
  }

  const parentName = names?.parentRenderingName || parent.renderingName;
  const childName = names?.childRenderingName || child.renderingName;

  if (
    profileExposesChildPlaceholders(parent) &&
    isDistinctParentChildPair(parent, child) &&
    renderingNamesSuggestParentChild(parentName, childName)
  ) {
    return true;
  }

  if (!(parent.usesSxaDynamicPlaceholders || parent.hasDynamicPlaceholders)) {
    return false;
  }

  return (
    nameSuggestsContainer(parentName) &&
    nameSuggestsLeaf(childName) &&
    renderingNamesSuggestParentChild(parentName, childName)
  );
}

/**
 * Resolves child placeholder key for queue linking, including SXA fallbacks
 * when Sitecore multilist keys were not loaded during Discovery.
 */
export function resolveChildPlaceholderKeyForNesting(
  parentRenderingPath: string | undefined,
  childRenderingPath: string | undefined,
  profiles: RenderingPlaceholderProfile[] | undefined,
  debugContext?: {
    childRenderingName?: string;
    parentRenderingName?: string;
    placeholders?: PlaceholderDefinition[];
  },
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
    childRenderingPath,
    childRenderingName: debugContext?.childRenderingName ?? child.renderingName,
    placeholders: debugContext?.placeholders,
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
