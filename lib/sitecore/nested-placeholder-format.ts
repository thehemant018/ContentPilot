import type { NestedPlaceholderFormat, RenderingPlaceholderProfile } from "@/types/discovery";

function isPathBasedKeyPattern(key: string): boolean {
  return /\/[^/]+-\d+$/.test(key.trim().replace(/^\/+/, ""));
}

type PlaceholderFormatInput = Pick<
  RenderingPlaceholderProfile,
  | "usesSxaDynamicPlaceholders"
  | "hasDynamicPlaceholders"
  | "allowedParentPlaceholderKeys"
  | "exposedChildPlaceholderKeys"
  | "nestedPlaceholderFormat"
>;

/**
 * SXA headless / Page Builder uses path-suffix placeholders
 * (e.g. headless-main/CardList-Demo-1). MVC uses guid-suffix.
 */
export function resolveNestedPlaceholderFormat(
  profile: PlaceholderFormatInput,
): NestedPlaceholderFormat {
  if (profile.nestedPlaceholderFormat) {
    return profile.nestedPlaceholderFormat;
  }

  if (profile.usesSxaDynamicPlaceholders) {
    return "path-suffix";
  }

  const keys = [
    ...(profile.allowedParentPlaceholderKeys ?? []),
    ...(profile.exposedChildPlaceholderKeys ?? []),
  ];

  if (keys.some((key) => key.includes("/") || isPathBasedKeyPattern(key))) {
    return "path-suffix";
  }

  if (keys.some((key) => key.startsWith("headless-"))) {
    return "path-suffix";
  }

  return "guid-suffix";
}

export function resolveNestedPlaceholderFormatForPair(input: {
  parentProfile?: RenderingPlaceholderProfile;
  childProfile?: RenderingPlaceholderProfile;
  nestedPlaceholderFormat?: NestedPlaceholderFormat;
}): NestedPlaceholderFormat {
  if (input.nestedPlaceholderFormat) {
    return input.nestedPlaceholderFormat;
  }

  if (input.parentProfile) {
    const fromParent = resolveNestedPlaceholderFormat(input.parentProfile);
    if (fromParent === "path-suffix") {
      return "path-suffix";
    }
  }

  if (input.childProfile) {
    const fromChild = resolveNestedPlaceholderFormat(input.childProfile);
    if (fromChild === "path-suffix") {
      return "path-suffix";
    }
  }

  return (
    resolveNestedPlaceholderFormat(
      input.parentProfile ?? {
        allowedParentPlaceholderKeys: [],
        exposedChildPlaceholderKeys: [],
      },
    )
  );
}
