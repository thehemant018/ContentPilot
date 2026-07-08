import { describe, expect, it } from "vitest";

import {
  inferVisualMapperParentBlockIds,
  isSelectorDescendant,
} from "@/lib/visual-mapper/queue-hierarchy";
import { linkQueueHierarchy } from "@/lib/migration/queue-hierarchy";
import { mappingEntriesToQueueItems } from "@/lib/visual-mapper/run-migration";
import { resolveEntryBlockIds } from "@/lib/visual-mapper/template-key";
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

  it("detects ancestor chains built with child combinators", () => {
    expect(
      isSelectorDescendant(
        "main > section.card-list:nth-of-type(1) > article.card-item",
        "section.card-list:nth-of-type(1)",
      ),
    ).toBe(true);
    expect(
      isSelectorDescendant(
        "main > section.card-list:nth-of-type(2) > article.card-item",
        "section.card-list:nth-of-type(1)",
      ),
    ).toBe(false);
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

  it("links each CardItem to its own CardList when selectors are unique", () => {
    const profiles: RenderingPlaceholderProfile[] = [
      {
        renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
        renderingId: "parent-id",
        renderingName: "CardList-Demo",
        allowedParentPlaceholderKeys: ["headless-main"],
        exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
        defaultDynamicPlaceholderId: 2,
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

    const listA: MappingEntry = {
      id: "list-a",
      templateKey: "CardList-Demo::main > section.card-list:nth-of-type(1)",
      sourceSelector: "main > section.card-list:nth-of-type(1)",
      sourcePageUrl: "https://example.com",
      renderingName: "CardList-Demo",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      templateName: "CardList-Demo",
      templatePath: "/sitecore/templates/Feature/CardList-Demo",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const itemA: MappingEntry = {
      id: "item-a",
      templateKey:
        "CardItem::main > section.card-list:nth-of-type(1) > article.card-item",
      sourceSelector:
        "main > section.card-list:nth-of-type(1) > article.card-item",
      sourcePageUrl: "https://example.com",
      renderingName: "CardItem",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardItem",
      templateName: "CardItem",
      templatePath: "/sitecore/templates/Feature/CardItem",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const listB: MappingEntry = {
      ...listA,
      id: "list-b",
      templateKey: "CardList-Demo::main > section.card-list:nth-of-type(2)",
      sourceSelector: "main > section.card-list:nth-of-type(2)",
    };
    const itemB: MappingEntry = {
      ...itemA,
      id: "item-b",
      templateKey:
        "CardItem::main > section.card-list:nth-of-type(2) > article.card-item",
      sourceSelector:
        "main > section.card-list:nth-of-type(2) > article.card-item",
    };

    const parents = inferVisualMapperParentBlockIds(
      [listA, itemA, listB, itemB],
      profiles,
    );

    expect(parents.get("item-a")).toBe(listA.templateKey);
    expect(parents.get("item-b")).toBe(listB.templateKey);
  });

  it("distributes CardItems across preceding CardLists when selectors collide", () => {
    const profiles: RenderingPlaceholderProfile[] = [
      {
        renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
        renderingId: "parent-id",
        renderingName: "CardList-Demo",
        allowedParentPlaceholderKeys: ["headless-main"],
        exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
        defaultDynamicPlaceholderId: 2,
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

    const sharedListSelector = "section.card-list";
    const sharedItemSelector = "article.card-item";
    const listA: MappingEntry = {
      id: "list-a",
      templateKey: `CardList-Demo::${sharedListSelector}`,
      sourceSelector: sharedListSelector,
      sourcePageUrl: "https://example.com",
      renderingName: "CardList-Demo",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      templateName: "CardList-Demo",
      templatePath: "/sitecore/templates/Feature/CardList-Demo",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const listB: MappingEntry = {
      ...listA,
      id: "list-b",
    };
    const itemA: MappingEntry = {
      id: "item-a",
      templateKey: `CardItem::${sharedItemSelector}`,
      sourceSelector: sharedItemSelector,
      sourcePageUrl: "https://example.com",
      renderingName: "CardItem",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardItem",
      templateName: "CardItem",
      templatePath: "/sitecore/templates/Feature/CardItem",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const itemB: MappingEntry = {
      ...itemA,
      id: "item-b",
    };

    const entries = [listA, listB, itemA, itemB];
    const blockIdByEntryId = resolveEntryBlockIds(entries);
    const parents = inferVisualMapperParentBlockIds(
      entries,
      profiles,
      blockIdByEntryId,
    );

    expect(parents.get("item-a")).toBe(blockIdByEntryId.get("list-a"));
    expect(parents.get("item-b")).toBe(blockIdByEntryId.get("list-b"));
    expect(parents.get("item-a")).not.toBe(parents.get("item-b"));
  });

  it("balances CardItems across CardLists when child selectors match both parents", () => {
    const profiles: RenderingPlaceholderProfile[] = [
      {
        renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
        renderingId: "parent-id",
        renderingName: "CardList-Demo",
        allowedParentPlaceholderKeys: ["headless-main"],
        exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
        defaultDynamicPlaceholderId: 2,
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

    const sharedListSelector = "section.card-list";
    const sharedChildSelector = "section.card-list .card-item";
    const listA: MappingEntry = {
      id: "list-a",
      templateKey: `CardList-Demo::${sharedListSelector}`,
      sourceSelector: sharedListSelector,
      sourcePageUrl: "https://example.com",
      renderingName: "CardList-Demo",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      templateName: "CardList-Demo",
      templatePath: "/sitecore/templates/Feature/CardList-Demo",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const listB: MappingEntry = {
      ...listA,
      id: "list-b",
    };
    const itemA: MappingEntry = {
      id: "item-a",
      templateKey: `CardItem::${sharedChildSelector}`,
      sourceSelector: sharedChildSelector,
      sourcePageUrl: "https://example.com",
      renderingName: "CardItem",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardItem",
      templateName: "CardItem",
      templatePath: "/sitecore/templates/Feature/CardItem",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const itemB: MappingEntry = {
      ...itemA,
      id: "item-b",
    };

    const entries = [listA, listB, itemA, itemB];
    const blockIdByEntryId = resolveEntryBlockIds(entries);
    const parents = inferVisualMapperParentBlockIds(
      entries,
      profiles,
      blockIdByEntryId,
    );

    expect(parents.get("item-a")).toBe(blockIdByEntryId.get("list-a"));
    expect(parents.get("item-b")).toBe(blockIdByEntryId.get("list-b"));
  });

  it("keeps Hero as a root mapping when CardLists are on the same page", () => {
    const profiles: RenderingPlaceholderProfile[] = [
      {
        renderingPath: "/sitecore/layout/Renderings/Feature/Hero",
        renderingId: "hero-id",
        renderingName: "Hero",
        allowedParentPlaceholderKeys: ["headless-main"],
        exposedChildPlaceholderKeys: [],
        usesSxaDynamicPlaceholders: false,
        hasDynamicPlaceholders: false,
        nestedPlaceholderFormat: "path-suffix",
      },
      {
        renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
        renderingId: "parent-id",
        renderingName: "CardList-Demo",
        allowedParentPlaceholderKeys: ["headless-main"],
        exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
        defaultDynamicPlaceholderId: 2,
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

    const hero: MappingEntry = {
      id: "hero-entry",
      templateKey: "Hero::main > section.hero:nth-of-type(1)",
      sourceSelector: "main > section.hero:nth-of-type(1)",
      sourcePageUrl: "https://example.com",
      renderingName: "Hero",
      renderingPath: "/sitecore/layout/Renderings/Feature/Hero",
      templateName: "Hero",
      templatePath: "/sitecore/templates/Feature/Hero",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const listA: MappingEntry = {
      id: "list-a",
      templateKey: "CardList-Demo::main > section.card-list:nth-of-type(1)",
      sourceSelector: "main > section.card-list:nth-of-type(1)",
      sourcePageUrl: "https://example.com",
      renderingName: "CardList-Demo",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      templateName: "CardList-Demo",
      templatePath: "/sitecore/templates/Feature/CardList-Demo",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const itemA: MappingEntry = {
      id: "item-a",
      templateKey:
        "CardItem::main > section.card-list:nth-of-type(1) > article.card-item",
      sourceSelector:
        "main > section.card-list:nth-of-type(1) > article.card-item",
      sourcePageUrl: "https://example.com",
      renderingName: "CardItem",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardItem",
      templateName: "CardItem",
      templatePath: "/sitecore/templates/Feature/CardItem",
      fieldAssignments: [],
      createdAt: new Date(),
    };

    const parents = inferVisualMapperParentBlockIds(
      [hero, listA, itemA],
      profiles,
    );

    expect(parents.has("hero-entry")).toBe(false);
    expect(parents.get("item-a")).toBe(listA.templateKey);
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
      defaultDynamicPlaceholderId: 2,
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

  it("links two CardLists and their CardItems to distinct parents", () => {
    const listA: MappingEntry = {
      id: "list-a",
      templateKey: "CardList-Demo::main > section.card-list:nth-of-type(1)",
      sourceSelector: "main > section.card-list:nth-of-type(1)",
      sourcePageUrl: "https://example.com/",
      renderingName: "CardList-Demo",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      templateName: "CardList-Demo",
      templatePath: "/sitecore/templates/Feature/CardList-Demo",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const itemA: MappingEntry = {
      id: "item-a",
      templateKey:
        "CardItem::main > section.card-list:nth-of-type(1) > article.card-item",
      sourceSelector:
        "main > section.card-list:nth-of-type(1) > article.card-item",
      sourcePageUrl: "https://example.com/",
      renderingName: "CardItem",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardItem",
      templateName: "CardItem",
      templatePath: "/sitecore/templates/Feature/CardItem",
      fieldAssignments: [],
      createdAt: new Date(),
    };
    const listB: MappingEntry = {
      ...listA,
      id: "list-b",
      templateKey: "CardList-Demo::main > section.card-list:nth-of-type(2)",
      sourceSelector: "main > section.card-list:nth-of-type(2)",
    };
    const itemB: MappingEntry = {
      ...itemA,
      id: "item-b",
      templateKey:
        "CardItem::main > section.card-list:nth-of-type(2) > article.card-item",
      sourceSelector:
        "main > section.card-list:nth-of-type(2) > article.card-item",
    };

    const items = mappingEntriesToQueueItems(
      [listA, itemA, listB, itemB],
      "https://example.com/",
      "Example",
      "/sitecore/content/site/home",
      profiles,
    );

    const linkedListA = items.find((item) => item.blockId === listA.templateKey);
    const linkedListB = items.find((item) => item.blockId === listB.templateKey);
    const linkedItemA = items.find((item) => item.blockId === itemA.templateKey);
    const linkedItemB = items.find((item) => item.blockId === itemB.templateKey);

    expect(linkedItemA?.parentQueueItemId).toBe(linkedListA?.id);
    expect(linkedItemB?.parentQueueItemId).toBe(linkedListB?.id);
    expect(linkedListA?.dynamicPlaceholderId).toBe(2);
    expect(linkedListB?.dynamicPlaceholderId).toBe(3);
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
