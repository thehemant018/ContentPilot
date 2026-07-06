import { describe, expect, it } from "vitest";

import {
  resolveNestedPlaceholderFormat,
  resolveNestedPlaceholderFormatForPair,
} from "@/lib/sitecore/nested-placeholder-format";
import type { RenderingPlaceholderProfile } from "@/types/discovery";

describe("resolveNestedPlaceholderFormat", () => {
  it("uses path-suffix for SXA dynamic placeholders even when keys are empty", () => {
    expect(
      resolveNestedPlaceholderFormat({
        usesSxaDynamicPlaceholders: true,
        hasDynamicPlaceholders: true,
        allowedParentPlaceholderKeys: [],
        exposedChildPlaceholderKeys: [],
      }),
    ).toBe("path-suffix");
  });

  it("uses guid-suffix for non-SXA renderings without path keys", () => {
    expect(
      resolveNestedPlaceholderFormat({
        usesSxaDynamicPlaceholders: false,
        hasDynamicPlaceholders: false,
        allowedParentPlaceholderKeys: ["main"],
        exposedChildPlaceholderKeys: ["content"],
      }),
    ).toBe("guid-suffix");
  });
});

describe("resolveNestedPlaceholderFormatForPair", () => {
  const sxaParent: RenderingPlaceholderProfile = {
    renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
    renderingId: "parent",
    renderingName: "CardList-Demo",
    allowedParentPlaceholderKeys: [],
    exposedChildPlaceholderKeys: [],
    usesSxaDynamicPlaceholders: true,
    hasDynamicPlaceholders: true,
    nestedPlaceholderFormat: "path-suffix",
  };

  it("prefers path-suffix when parent is SXA headless", () => {
    expect(
      resolveNestedPlaceholderFormatForPair({
        parentProfile: sxaParent,
        childProfile: undefined,
      }),
    ).toBe("path-suffix");
  });
});
