import { describe, expect, it } from "vitest";

import {
  allocateDynamicPlaceholderId,
  buildNestedChildPlaceholderKey,
  buildPathBasedNestedPlaceholderKey,
  buildGuidSuffixNestedPlaceholderKey,
} from "@/lib/sitecore/dynamic-placeholder";
import { applyPresentationTreeToLayoutXml } from "@/lib/sitecore/presentation-tree";
import { resolveChildPlaceholderKey } from "@/lib/migration/placeholder-registry";
import { linkQueueHierarchy } from "@/lib/migration/queue-hierarchy";
import type { RenderingPlaceholderProfile } from "@/types/discovery";
import type { MigrationComponentExport } from "@/types/migration-export";
import type { MigrationQueueItem } from "@/types/migration-queue";

const profiles: RenderingPlaceholderProfile[] = [
  {
    renderingPath: "/sitecore/layout/Renderings/Feature/Project/Card List",
    renderingId: "parent-id",
    renderingName: "Card List",
    allowedParentPlaceholderKeys: ["headless-main"],
    exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
    defaultDynamicPlaceholderId: 2,
    hasDynamicPlaceholders: true,
    usesSxaDynamicPlaceholders: true,
    inheritsIDynamicPlaceholder: true,
    nestedPlaceholderFormat: "path-suffix",
  },
  {
    renderingPath: "/sitecore/layout/Renderings/Feature/Project/Card Item",
    renderingId: "child-id",
    renderingName: "Card Item",
    allowedParentPlaceholderKeys: ["headless-main/CardList-Demo-{*}"],
    exposedChildPlaceholderKeys: [],
    nestedPlaceholderFormat: "path-suffix",
  },
];

describe("buildPathBasedNestedPlaceholderKey", () => {
  it("builds headless nested placeholder keys from Sitecore key patterns", () => {
    expect(
      buildPathBasedNestedPlaceholderKey(
        "headless-main",
        "CardList-Demo-{*}",
        2,
      ),
    ).toBe("/headless-main/CardList-Demo-2");
  });
});

describe("buildGuidSuffixNestedPlaceholderKey", () => {
  it("builds MVC-style dynamic placeholder keys", () => {
    expect(
      buildGuidSuffixNestedPlaceholderKey(
        "card-list-items",
        "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
        1,
      ),
    ).toBe(
      "card-list-items-{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}-1",
    );
  });
});

describe("buildNestedChildPlaceholderKey", () => {
  it("uses path-suffix format for headless nested components", () => {
    expect(
      buildNestedChildPlaceholderKey({
        format: "path-suffix",
        parentResolvedPlaceholder: "headless-main",
        parentRenderingName: "Card List",
        parentRenderingUid: "{AAA}",
        childPlaceholderKey: "CardList-Demo-{*}",
        dynamicPlaceholderId: 2,
      }),
    ).toBe("/headless-main/CardList-Demo-2");
  });
});

describe("allocateDynamicPlaceholderId", () => {
  it("increments when placeholders already exist on the page", () => {
    const layoutXml = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{A}" s:id="{R}" s:ph="headless-main/CardList-Demo-2" s:ds="{D}" s:par="" s:ccb="Clear on publish" /></d></r>`;

    expect(
      allocateDynamicPlaceholderId(
        layoutXml,
        "headless-main",
        "CardList-Demo-{*}",
        2,
      ),
    ).toBe(3);
  });

  it("returns default when page has no matching placeholders", () => {
    expect(
      allocateDynamicPlaceholderId("", "headless-main", "CardList-Demo-{*}", 2),
    ).toBe(2);
  });
});

describe("applyPresentationTreeToLayoutXml", () => {
  it("inserts parent then children with path-based dynamic placeholders", () => {
    const parent: MigrationComponentExport = {
      queueItemId: "parent",
      exportedAt: "2026-01-01",
      blockType: "card-grid",
      sourcePageUrl: "https://example.com",
      targetPagePath: "/sitecore/content/home",
      matchScore: 90,
      confidence: "high",
      datasource: {
        name: "Card List",
        path: "/sitecore/content/home/Data/card-list",
        templateName: "Card List",
        fields: {},
        fieldMeta: [],
      },
      presentation: {
        itemPath: "/sitecore/content/home",
        renderingName: "Card List",
        renderingPath: profiles[0]!.renderingPath,
        placeHolder: "headless-main",
        dataSource: "/sitecore/content/home/Data/card-list",
        finalLayout: false,
        language: "en",
        index: 0,
        presentationDepth: 0,
        dynamicPlaceholderId: 2,
      },
    };

    const child: MigrationComponentExport = {
      queueItemId: "child",
      exportedAt: "2026-01-01",
      blockType: "card-grid",
      sourcePageUrl: "https://example.com",
      targetPagePath: "/sitecore/content/home",
      matchScore: 88,
      confidence: "high",
      datasource: {
        name: "Card Item",
        path: "/sitecore/content/home/Data/card-item",
        templateName: "Card Item",
        fields: {},
        fieldMeta: [],
      },
      presentation: {
        itemPath: "/sitecore/content/home",
        renderingName: "Card Item",
        renderingPath: profiles[1]!.renderingPath,
        placeHolder: "card-list-items",
        dataSource: "/sitecore/content/home/Data/card-item",
        finalLayout: false,
        language: "en",
        index: 1,
        parentQueueItemId: "parent",
        childPlaceholderKey: "CardList-Demo-{*}",
        presentationDepth: 1,
        presentationSiblingIndex: 0,
      },
    };

    const renderingIdByPath = new Map([
      [profiles[0]!.renderingPath, "RENDERING-PARENT"],
      [profiles[1]!.renderingPath, "RENDERING-CHILD"],
    ]);
    const datasourceIdByPath = new Map([
      [parent.datasource.path, "DS-PARENT"],
      [child.datasource.path, "DS-CHILD"],
    ]);

    const { layoutXml } = applyPresentationTreeToLayoutXml(
      "",
      [parent, child],
      renderingIdByPath,
      datasourceIdByPath,
      profiles,
    );

    expect(layoutXml).toContain('s:ph="headless-main"');
    expect(layoutXml).toContain("DynamicPlaceholderId=2");
    expect(layoutXml).toContain('s:ph="/headless-main/CardList-Demo-2"');
  });

  it("reuses an existing parent on the page when inserting nested children", () => {
    const existingLayout = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{11111111-1111-1111-1111-111111111111}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="headless-main" s:ds="{33333333-3333-3333-3333-333333333333}" s:par="&amp;DynamicPlaceholderId=2" s:ccb="Clear on publish" /></d></r>`;

    const parent: MigrationComponentExport = {
      queueItemId: "parent",
      exportedAt: "2026-01-01",
      blockType: "card-grid",
      sourcePageUrl: "https://example.com",
      targetPagePath: "/sitecore/content/home",
      matchScore: 90,
      confidence: "high",
      datasource: {
        name: "Card List",
        path: "/sitecore/content/home/Data/card-list",
        templateName: "Card List",
        fields: {},
        fieldMeta: [],
      },
      presentation: {
        itemPath: "/sitecore/content/home",
        renderingName: "Card List",
        renderingPath: profiles[0]!.renderingPath,
        placeHolder: "headless-main",
        dataSource: "/sitecore/content/home/Data/card-list",
        finalLayout: false,
        language: "en",
        index: 0,
        presentationDepth: 0,
        dynamicPlaceholderId: 2,
      },
    };

    const child: MigrationComponentExport = {
      queueItemId: "child",
      exportedAt: "2026-01-01",
      blockType: "card-grid",
      sourcePageUrl: "https://example.com",
      targetPagePath: "/sitecore/content/home",
      matchScore: 88,
      confidence: "high",
      datasource: {
        name: "Card Item",
        path: "/sitecore/content/home/Data/card-item",
        templateName: "Card Item",
        fields: {},
        fieldMeta: [],
      },
      presentation: {
        itemPath: "/sitecore/content/home",
        renderingName: "Card Item",
        renderingPath: profiles[1]!.renderingPath,
        placeHolder: "card-list-items",
        dataSource: "/sitecore/content/home/Data/card-item",
        finalLayout: false,
        language: "en",
        index: 1,
        parentQueueItemId: "parent",
        childPlaceholderKey: "CardList-Demo-{*}",
        presentationDepth: 1,
        presentationSiblingIndex: 0,
      },
    };

    const renderingIdByPath = new Map([
      [profiles[0]!.renderingPath, "22222222-2222-2222-2222-222222222222"],
      [profiles[1]!.renderingPath, "44444444-4444-4444-4444-444444444444"],
    ]);
    const datasourceIdByPath = new Map([
      [parent.datasource.path, "33333333-3333-3333-3333-333333333333"],
      [child.datasource.path, "55555555-5555-5555-5555-555555555555"],
    ]);

    const { layoutXml, nodes, skipped } = applyPresentationTreeToLayoutXml(
      existingLayout,
      [parent, child],
      renderingIdByPath,
      datasourceIdByPath,
      profiles,
    );

    expect(nodes).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(layoutXml).toContain('s:ph="/headless-main/CardList-Demo-2"');
  });

  it("patches existing parent missing DynamicPlaceholderId before inserting children", () => {
    const existingLayout = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{11111111-1111-1111-1111-111111111111}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="headless-main" s:ds="{33333333-3333-3333-3333-333333333333}" s:par="" s:ccb="Clear on publish" /></d></r>`;

    const parent: MigrationComponentExport = {
      queueItemId: "parent",
      exportedAt: "2026-01-01",
      blockType: "card-grid",
      sourcePageUrl: "https://example.com",
      targetPagePath: "/sitecore/content/home",
      matchScore: 90,
      confidence: "high",
      datasource: {
        name: "Card List",
        path: "/sitecore/content/home/Data/card-list",
        templateName: "Card List",
        fields: {},
        fieldMeta: [],
      },
      presentation: {
        itemPath: "/sitecore/content/home",
        renderingName: "Card List",
        renderingPath: profiles[0]!.renderingPath,
        placeHolder: "headless-main",
        dataSource: "/sitecore/content/home/Data/card-list",
        finalLayout: false,
        language: "en",
        index: 0,
        presentationDepth: 0,
        dynamicPlaceholderId: 2,
      },
    };

    const child: MigrationComponentExport = {
      queueItemId: "child",
      exportedAt: "2026-01-01",
      blockType: "card-grid",
      sourcePageUrl: "https://example.com",
      targetPagePath: "/sitecore/content/home",
      matchScore: 88,
      confidence: "high",
      datasource: {
        name: "Card Item",
        path: "/sitecore/content/home/Data/card-item",
        templateName: "Card Item",
        fields: {},
        fieldMeta: [],
      },
      presentation: {
        itemPath: "/sitecore/content/home",
        renderingName: "Card Item",
        renderingPath: profiles[1]!.renderingPath,
        placeHolder: "card-list-items",
        dataSource: "/sitecore/content/home/Data/card-item",
        finalLayout: false,
        language: "en",
        index: 1,
        parentQueueItemId: "parent",
        childPlaceholderKey: "CardList-Demo-{*}",
        presentationDepth: 1,
        presentationSiblingIndex: 0,
      },
    };

    const renderingIdByPath = new Map([
      [profiles[0]!.renderingPath, "22222222-2222-2222-2222-222222222222"],
      [profiles[1]!.renderingPath, "44444444-4444-4444-4444-444444444444"],
    ]);
    const datasourceIdByPath = new Map([
      [parent.datasource.path, "33333333-3333-3333-3333-333333333333"],
      [child.datasource.path, "55555555-5555-5555-5555-555555555555"],
    ]);

    const { layoutXml, nodes, skipped } = applyPresentationTreeToLayoutXml(
      existingLayout,
      [parent, child],
      renderingIdByPath,
      datasourceIdByPath,
      profiles,
    );

    expect(nodes).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(layoutXml).toContain("DynamicPlaceholderId=2");
    expect(layoutXml).toContain('s:ph="/headless-main/CardList-Demo-2"');
  });
});

describe("resolveChildPlaceholderKey", () => {
  it("resolves nested placeholder from rendering profiles", () => {
    expect(
      resolveChildPlaceholderKey(
        "/sitecore/layout/Renderings/Feature/Project/Card List",
        "/sitecore/layout/Renderings/Feature/Project/Card Item",
        profiles,
      ),
    ).toBe("CardList-Demo-{*}");
  });

  it("resolves path-suffix allowed placeholders against parent exposed keys", () => {
    const pathSuffixProfiles: RenderingPlaceholderProfile[] = [
      {
        renderingPath: "/sitecore/layout/Renderings/Feature/Project/CardList",
        renderingId: "parent-id",
        renderingName: "CardList",
        allowedParentPlaceholderKeys: ["headless-main"],
        exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
        hasDynamicPlaceholders: true,
        nestedPlaceholderFormat: "path-suffix",
      },
      {
        renderingPath: "/sitecore/layout/Renderings/Feature/Project/CardItem",
        renderingId: "child-id",
        renderingName: "CardItem",
        allowedParentPlaceholderKeys: ["headless-main/CardList-Demo-{*}"],
        exposedChildPlaceholderKeys: [],
        nestedPlaceholderFormat: "path-suffix",
      },
    ];

    expect(
      resolveChildPlaceholderKey(
        pathSuffixProfiles[0]!.renderingPath,
        pathSuffixProfiles[1]!.renderingPath,
        pathSuffixProfiles,
      ),
    ).toBe("CardList-Demo-{*}");
  });
});

describe("linkQueueHierarchy", () => {
  it("links child queue items and applies parent default DynamicPlaceholderId", () => {
    const parent: MigrationQueueItem = {
      id: "parent-queue",
      addedAt: "2026-01-01T00:00:00.000Z",
      blockId: "block-parent",
      sourcePageUrl: "https://example.com/page",
      blockType: "card-grid",
      renderingName: "Card List",
      renderingPath: profiles[0]!.renderingPath,
      templateName: "Card List",
      matchScore: 90,
      confidence: "high",
      reasoning: "test",
      targetPagePath: "/sitecore/content/site/home",
      fields: [],
    };

    const child: MigrationQueueItem = {
      id: "child-queue",
      addedAt: "2026-01-01T00:00:01.000Z",
      blockId: "block-child",
      parentBlockId: "block-parent",
      sourcePageUrl: "https://example.com/page",
      blockType: "card-grid",
      renderingName: "Card Item",
      renderingPath: profiles[1]!.renderingPath,
      templateName: "Card Item",
      matchScore: 88,
      confidence: "high",
      reasoning: "test",
      targetPagePath: "/sitecore/content/site/home",
      fields: [],
    };

    const linked = linkQueueHierarchy([parent, child], profiles);
    const linkedParent = linked.find((item) => item.id === "parent-queue");
    const linkedChild = linked.find((item) => item.id === "child-queue");

    expect(linkedChild?.parentQueueItemId).toBe("parent-queue");
    expect(linkedChild?.childPlaceholderKey).toBe("CardList-Demo-{*}");
    expect(linkedChild?.presentationDepth).toBe(1);
    expect(linkedParent?.dynamicPlaceholderId).toBe(2);
  });

  it("infers CardItem parent from rendering profiles when parentBlockId is missing", () => {
    const parent: MigrationQueueItem = {
      id: "parent-queue",
      addedAt: "2026-01-01T00:00:00.000Z",
      blockId: "block-parent",
      sourcePageUrl: "https://example.com/page",
      blockType: "card-grid",
      renderingName: "CardList-Demo",
      renderingPath: "/sitecore/layout/Renderings/Feature/Project/CardList-Demo",
      templateName: "CardList-Demo",
      matchScore: 90,
      confidence: "high",
      reasoning: "test",
      targetPagePath: "/sitecore/content/site/home",
      placeholder: "headless-main",
      fields: [],
    };

    const child: MigrationQueueItem = {
      id: "child-queue",
      addedAt: "2026-01-01T00:00:01.000Z",
      blockId: "block-child",
      sourcePageUrl: "https://example.com/page",
      blockType: "card-grid",
      renderingName: "CardItem",
      renderingPath: "/sitecore/layout/Renderings/Feature/Project/CardItem",
      templateName: "CardItem",
      matchScore: 88,
      confidence: "high",
      reasoning: "test",
      targetPagePath: "/sitecore/content/site/home",
      fields: [],
    };

    const sxaProfiles: RenderingPlaceholderProfile[] = [
      {
        renderingPath: "/sitecore/layout/Renderings/Feature/Project/CardList-Demo",
        renderingId: "parent-id",
        renderingName: "CardList-Demo",
        allowedParentPlaceholderKeys: ["headless-main"],
        exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
        hasDynamicPlaceholders: true,
        usesSxaDynamicPlaceholders: true,
        nestedPlaceholderFormat: "path-suffix",
      },
      {
        renderingPath: "/sitecore/layout/Renderings/Feature/Project/CardItem",
        renderingId: "child-id",
        renderingName: "CardItem",
        allowedParentPlaceholderKeys: ["headless-main/CardList-Demo-{*}"],
        exposedChildPlaceholderKeys: [],
        hasDynamicPlaceholders: true,
        usesSxaDynamicPlaceholders: true,
        nestedPlaceholderFormat: "path-suffix",
      },
    ];

    const linked = linkQueueHierarchy([parent, child], sxaProfiles);
    const linkedChild = linked.find((item) => item.id === "child-queue");

    expect(linkedChild?.parentQueueItemId).toBe("parent-queue");
    expect(linkedChild?.childPlaceholderKey).toBe("CardList-Demo-{*}");
    expect(linkedChild?.presentationDepth).toBe(1);
  });

  it("links each Card Item to the correct Card List when a page has two lists", () => {
    const listA: MigrationQueueItem = {
      id: "list-a",
      addedAt: "2026-01-01T00:00:00.000Z",
      blockId: "grid-a",
      sourcePageUrl: "https://example.com/page",
      blockType: "card-grid",
      renderingName: "Card List",
      renderingPath: profiles[0]!.renderingPath,
      templateName: "Card List",
      matchScore: 90,
      confidence: "high",
      reasoning: "test",
      targetPagePath: "/sitecore/content/site/home",
      placeholder: "headless-main",
      fields: [],
    };

    const listB: MigrationQueueItem = {
      ...listA,
      id: "list-b",
      addedAt: "2026-01-01T00:00:01.000Z",
      blockId: "grid-b",
    };

    const itemA: MigrationQueueItem = {
      id: "item-a",
      addedAt: "2026-01-01T00:00:02.000Z",
      blockId: "grid-a-sub-1",
      parentBlockId: "grid-a",
      sourcePageUrl: "https://example.com/page",
      blockType: "card-grid",
      renderingName: "Card Item",
      renderingPath: profiles[1]!.renderingPath,
      templateName: "Card Item",
      matchScore: 88,
      confidence: "high",
      reasoning: "test",
      targetPagePath: "/sitecore/content/site/home",
      fields: [],
    };

    const itemB: MigrationQueueItem = {
      ...itemA,
      id: "item-b",
      addedAt: "2026-01-01T00:00:03.000Z",
      blockId: "grid-b-sub-1",
      parentBlockId: "grid-b",
    };

    const linked = linkQueueHierarchy(
      [listA, itemB, listB, itemA],
      profiles,
    );

    expect(linked.find((item) => item.id === "item-a")?.parentQueueItemId).toBe(
      "list-a",
    );
    expect(linked.find((item) => item.id === "item-b")?.parentQueueItemId).toBe(
      "list-b",
    );
    expect(linked.find((item) => item.id === "list-a")?.dynamicPlaceholderId).toBe(
      2,
    );
    expect(linked.find((item) => item.id === "list-b")?.dynamicPlaceholderId).toBe(
      3,
    );
  });
});
