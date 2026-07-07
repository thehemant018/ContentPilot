import { describe, expect, it } from "vitest";

import {
  inferVisualMapperParentBlockIds,
  isSelectorDescendant,
} from "@/lib/visual-mapper/queue-hierarchy";
import { linkQueueHierarchy } from "@/lib/migration/queue-hierarchy";
import { mappingEntriesToQueueItems } from "@/lib/visual-mapper/run-migration";
import type { MappingEntry } from "@/types/visual-mapper";
import type { RenderingPlaceholderProfile } from "@/types/discovery";

describe("isSelectorDescendant", () => {
  it("detects nested selectors", () => {
    expect(isSelectorDescendant("section.cards .card-item", "section.cards")).toBe(
      true,
    );
    expect(isSelectorDescendant("section.cards>.card-item", "section.cards")).toBe(
      true,
    );
    expect(isSelectorDescendant("section.cards", "section.cards")).toBe(false);
    expect(isSelectorDescendant("section.other .card-item", "section.cards")).toBe(
      false,
    );
  });
});

describe("inferVisualMapperParentBlockIds", () => {
  it("links child mapping to the most specific parent selector", () => {
    const parent: MappingEntry = {
      id: "parent-entry",
      templateKey: "CardList-Demo::section.cards",
      sourceSelector: "section.cards",
      sourcePageUrl: "https://example.com",
      renderingName: "CardList-Demo",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      templateName: "CardList-Demo",
      templatePath: "/sitecore/templates/Feature/CardList-Demo",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const child: MappingEntry = {
      id: "child-entry",
      templateKey: "CardItem::section.cards .card-item",
      sourceSelector: "section.cards .card-item",
      sourcePageUrl: "https://example.com",
      renderingName: "CardItem",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardItem",
      templateName: "CardItem",
      templatePath: "/sitecore/templates/Feature/CardItem",
      fieldAssignments: [],
      createdAt: new Date(),
    };

    const parents = inferVisualMapperParentBlockIds([parent, child]);
    expect(parents.get("child-entry")).toBe("CardList-Demo::section.cards");
  });
});

describe("mappingEntriesToQueueItems", () => {
  const profiles: RenderingPlaceholderProfile[] = [
    {
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      renderingId: "parent-id",
      renderingName: "CardList-Demo",
      allowedParentPlaceholderKeys: ["headless-main"],
      exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
      usesSxaDynamicPlaceholders: true,
      hasDynamicPlaceholders: true,
      nestedPlaceholderFormat: "path-suffix",
    },
    {
      renderingPath: "/sitecore/layout/Renderings/Feature/CardItem",
      renderingId: "child-id",
      renderingName: "CardItem",
      allowedParentPlaceholderKeys: ["headless-main/CardList-Demo-{*}"],
      exposedChildPlaceholderKeys: [],
      usesSxaDynamicPlaceholders: true,
      hasDynamicPlaceholders: true,
      nestedPlaceholderFormat: "path-suffix",
    },
  ];

  it("links nested visual mapper mappings before push", () => {
    const parent: MappingEntry = {
      id: "parent-entry",
      templateKey: "CardList-Demo::section.cards",
      sourceSelector: "section.cards",
      sourcePageUrl: "https://example.com/",
      renderingName: "CardList-Demo",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      templateName: "CardList-Demo",
      templatePath: "/sitecore/templates/Feature/CardList-Demo",
      fieldAssignments: [
        {
          sitecoreField: "Title",
          fieldType: "Single-Line Text",
          sourceSelector: "h2",
          value: "Cards",
          valuePreview: "Cards",
          assignedManually: true,
        },
      ],
      createdAt: new Date(),
    };
    const child: MappingEntry = {
      id: "child-entry",
      templateKey: "CardItem::section.cards .card-item",
      sourceSelector: "section.cards .card-item",
      sourcePageUrl: "https://example.com/",
      renderingName: "CardItem",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardItem",
      templateName: "CardItem",
      templatePath: "/sitecore/templates/Feature/CardItem",
      fieldAssignments: [
        {
          sitecoreField: "Title",
          fieldType: "Single-Line Text",
          sourceSelector: "h3",
          value: "Item",
          valuePreview: "Item",
          assignedManually: true,
        },
      ],
      createdAt: new Date(),
    };

    const items = mappingEntriesToQueueItems(
      [parent, child],
      "https://example.com/",
      "Example",
      "/sitecore/content/site/home",
      profiles,
    );

    const linkedChild = items.find((item) => item.renderingName === "CardItem");
    expect(linkedChild?.parentQueueItemId).toBeDefined();
    expect(linkedChild?.presentationDepth).toBe(1);
  });

  it("links sibling CardList and CardItem via rendering profiles", () => {
    const items = mappingEntriesToQueueItems(
      [
        {
          id: "parent-entry",
          sourceSelector: "section.cards",
          sourcePageUrl: "https://example.com",
          renderingName: "CardList-Demo",
          renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
          templateName: "CardList-Demo",
          templatePath: "/sitecore/templates/Feature/CardList-Demo",
          fieldAssignments: [],
          createdAt: new Date(),
        },
        {
          id: "child-entry",
          sourceSelector: "section.other-card",
          sourcePageUrl: "https://example.com",
          renderingName: "CardItem",
          renderingPath: "/sitecore/layout/Renderings/Feature/CardItem",
          templateName: "CardItem",
          templatePath: "/sitecore/templates/Feature/CardItem",
          fieldAssignments: [],
          createdAt: new Date(),
        },
      ],
      "https://example.com",
      "Example",
      "/sitecore/content/site/home",
      profiles,
    );

    const child = items.find((item) => item.renderingName === "CardItem");
    expect(child?.parentQueueItemId).toBeDefined();
    expect(child?.presentationDepth).toBe(1);
  });
});
