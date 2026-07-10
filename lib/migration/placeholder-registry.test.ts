import { describe, expect, it } from "vitest";

import {
  canNestUnderParentRendering,
  childAllowedInParentExposedPlaceholder,
  pickNestedPlaceholderKeyPattern,
  placeholderSettingAllowsRendering,
  profileExposesChildPlaceholders,
  resolveChildPlaceholderKey,
} from "@/lib/migration/placeholder-registry";
import type {
  PlaceholderDefinition,
  RenderingPlaceholderProfile,
} from "@/types/discovery";

const accordionParent: RenderingPlaceholderProfile = {
  renderingPath:
    "/sitecore/layout/Renderings/Feature/Hemant/Atlas Line Logistics/Accordion",
  renderingId: "accordion-id",
  renderingName: "Accordion",
  allowedParentPlaceholderKeys: ["1"],
  exposedChildPlaceholderKeys: ["Accordion-Demo-{*}"],
  hasDynamicPlaceholders: true,
  usesSxaDynamicPlaceholders: true,
  nestedPlaceholderFormat: "path-suffix",
};

const accordionChild: RenderingPlaceholderProfile = {
  renderingPath:
    "/sitecore/layout/Renderings/Feature/Hemant/Atlas Line Logistics/AccordionItem",
  renderingId: "accordion-item-id",
  renderingName: "AccordionItem",
  allowedParentPlaceholderKeys: ["1"],
  exposedChildPlaceholderKeys: [],
  hasDynamicPlaceholders: true,
  usesSxaDynamicPlaceholders: true,
  nestedPlaceholderFormat: "path-suffix",
};

describe("profileExposesChildPlaceholders", () => {
  it("is true when Discovery loaded exposed child placeholder keys", () => {
    expect(profileExposesChildPlaceholders(accordionParent)).toBe(true);
    expect(profileExposesChildPlaceholders(accordionChild)).toBe(false);
  });
});

describe("pickNestedPlaceholderKeyPattern", () => {
  it("uses parent exposed placeholders instead of container name heuristics", () => {
    expect(
      pickNestedPlaceholderKeyPattern({
        parentProfile: accordionParent,
        childProfile: accordionChild,
      }),
    ).toBe("Accordion-Demo-{*}");
  });
});

const accordionPlaceholderSetting: PlaceholderDefinition = {
  itemId: "accordion-placeholder-id",
  name: "Accordion1234",
  path: "/sitecore/layout/Placeholder Settings/Feature/Hemant/Accordion1234",
  key: "Accordion-Demo-{*}",
  allowedRenderingNames: ["AccordionItem"],
  allowedRenderingPaths: [
    "/sitecore/layout/Renderings/Feature/Hemant/Atlas Line Logistics/AccordionItem",
  ],
};

const cardListPlaceholderSetting: PlaceholderDefinition = {
  itemId: "card-list-placeholder-id",
  name: "CardList1234",
  path: "/sitecore/layout/Placeholder Settings/Feature/Hemant/CardList1234",
  key: "CardList-Demo-{*}",
  allowedRenderingNames: ["CardItem"],
  allowedRenderingPaths: ["/sitecore/layout/Renderings/Feature/CardItem"],
};

describe("placeholderSettingAllowsRendering", () => {
  it("matches child renderings listed in Placeholder Setting Allowed Controls", () => {
    expect(
      placeholderSettingAllowsRendering(
        accordionPlaceholderSetting,
        accordionChild.renderingPath,
        accordionChild.renderingName,
      ),
    ).toBe(true);
    expect(
      placeholderSettingAllowsRendering(
        cardListPlaceholderSetting,
        accordionChild.renderingPath,
        accordionChild.renderingName,
      ),
    ).toBe(false);
  });
});

describe("resolveChildPlaceholderKey", () => {
  it("resolves AccordionItem via Placeholder Setting Allowed Controls", () => {
    expect(
      resolveChildPlaceholderKey(
        accordionParent.renderingPath,
        accordionChild.renderingPath,
        [accordionParent, accordionChild],
        {
          childRenderingName: accordionChild.renderingName,
          placeholders: [accordionPlaceholderSetting],
        },
      ),
    ).toBe("Accordion-Demo-{*}");
  });
});

describe("canNestUnderParentRendering", () => {
  it("allows nesting when parent exposes Layout Service placeholders", () => {
    expect(
      canNestUnderParentRendering(
        accordionParent.renderingPath,
        accordionChild.renderingPath,
        [accordionParent, accordionChild],
      ),
    ).toBe(true);
  });

  it("uses Placeholder Setting Allowed Controls to reject unrelated parents", () => {
    const cardListParent: RenderingPlaceholderProfile = {
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      renderingId: "card-list-id",
      renderingName: "CardList-Demo",
      allowedParentPlaceholderKeys: ["headless-main"],
      exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
      hasDynamicPlaceholders: true,
      usesSxaDynamicPlaceholders: true,
      nestedPlaceholderFormat: "path-suffix",
    };

    expect(
      canNestUnderParentRendering(
        cardListParent.renderingPath,
        accordionChild.renderingPath,
        [cardListParent, accordionChild],
        {
          placeholders: [accordionPlaceholderSetting, cardListPlaceholderSetting],
        },
      ),
    ).toBe(false);

    expect(
      canNestUnderParentRendering(
        accordionParent.renderingPath,
        accordionChild.renderingPath,
        [accordionParent, accordionChild, cardListParent],
        {
          placeholders: [accordionPlaceholderSetting, cardListPlaceholderSetting],
        },
      ),
    ).toBe(true);
  });

  it("does not nest AccordionItem under CardList when both expose child placeholders", () => {
    const cardListParent: RenderingPlaceholderProfile = {
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      renderingId: "card-list-id",
      renderingName: "CardList-Demo",
      allowedParentPlaceholderKeys: ["headless-main"],
      exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
      hasDynamicPlaceholders: true,
      usesSxaDynamicPlaceholders: true,
      nestedPlaceholderFormat: "path-suffix",
    };

    expect(
      canNestUnderParentRendering(
        cardListParent.renderingPath,
        accordionChild.renderingPath,
        [cardListParent, accordionChild],
      ),
    ).toBe(false);
  });
});

describe("pickNestedPlaceholderKeyPattern allowed controls", () => {
  it("does not pick CardList placeholder for AccordionItem children", () => {
    const cardListParent: RenderingPlaceholderProfile = {
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      renderingId: "card-list-id",
      renderingName: "CardList-Demo",
      allowedParentPlaceholderKeys: ["headless-main"],
      exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
      hasDynamicPlaceholders: true,
      usesSxaDynamicPlaceholders: true,
      nestedPlaceholderFormat: "path-suffix",
    };

    expect(
      pickNestedPlaceholderKeyPattern({
        parentProfile: cardListParent,
        childProfile: accordionChild,
        placeholders: [accordionPlaceholderSetting, cardListPlaceholderSetting],
      }),
    ).toBeNull();

    expect(
      pickNestedPlaceholderKeyPattern({
        parentProfile: accordionParent,
        childProfile: accordionChild,
        placeholders: [accordionPlaceholderSetting, cardListPlaceholderSetting],
      }),
    ).toBe("Accordion-Demo-{*}");
  });

  it("reports childAllowedInParentExposedPlaceholder from Allowed Controls", () => {
    expect(
      childAllowedInParentExposedPlaceholder(
        accordionParent,
        accordionChild.renderingPath,
        accordionChild.renderingName,
        [accordionPlaceholderSetting],
      ),
    ).toBe(true);
  });
});
