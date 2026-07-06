import { describe, expect, it } from "vitest";

import {
  buildComponentExport,
  resolveExportPresentationPlaceholder,
} from "@/lib/migration/build-export";
import type { RenderingPlaceholderProfile } from "@/types/discovery";
import type { MigrationQueueItem } from "@/types/migration-queue";

const profiles: RenderingPlaceholderProfile[] = [
  {
    renderingPath: "/sitecore/layout/Renderings/Feature/Project/Card List",
    renderingId: "parent-id",
    renderingName: "Card List",
    allowedParentPlaceholderKeys: ["headless-main"],
    exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
    defaultDynamicPlaceholderId: 1,
    hasDynamicPlaceholders: true,
    usesSxaDynamicPlaceholders: true,
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

function makeQueueItem(
  overrides: Partial<MigrationQueueItem> & Pick<MigrationQueueItem, "id">,
): MigrationQueueItem {
  return {
    addedAt: "2026-01-01T00:00:00.000Z",
    blockId: `block-${overrides.id}`,
    sourcePageUrl: "https://example.com/page",
    blockType: "card-grid",
    renderingName: "Component",
    templateName: "Component",
    matchScore: 90,
    confidence: "high",
    reasoning: "test",
    targetPagePath: "/sitecore/content/site/home",
    fields: [],
    ...overrides,
  };
}

describe("resolveExportPresentationPlaceholder", () => {
  it("returns page placeholder for root components", () => {
    const parent = makeQueueItem({
      id: "parent",
      renderingName: "Card List",
      renderingPath: profiles[0]!.renderingPath,
      placeholder: "headless-main",
      dynamicPlaceholderId: 1,
    });
    const byId = new Map([[parent.id, parent]]);

    expect(
      resolveExportPresentationPlaceholder(parent, byId, profiles),
    ).toBe("headless-main");
  });

  it("returns path-based nested placeholder for child components", () => {
    const parent = makeQueueItem({
      id: "parent",
      renderingName: "Card List",
      renderingPath: profiles[0]!.renderingPath,
      placeholder: "headless-main",
      dynamicPlaceholderId: 1,
    });
    const child = makeQueueItem({
      id: "child",
      renderingName: "Card Item",
      renderingPath: profiles[1]!.renderingPath,
      parentQueueItemId: "parent",
      childPlaceholderKey: "CardList-Demo-{*}",
    });
    const byId = new Map([
      [parent.id, parent],
      [child.id, child],
    ]);

    expect(resolveExportPresentationPlaceholder(child, byId, profiles)).toBe(
      "/headless-main/CardList-Demo-1",
    );
  });
});

describe("buildComponentExport", () => {
  it("writes resolved nested placeholder into presentation export", () => {
    const parent = makeQueueItem({
      id: "parent",
      renderingName: "Card List",
      renderingPath: profiles[0]!.renderingPath,
      placeholder: "headless-main",
      dynamicPlaceholderId: 1,
    });
    const child = makeQueueItem({
      id: "child",
      renderingName: "Card Item",
      renderingPath: profiles[1]!.renderingPath,
      parentQueueItemId: "parent",
      childPlaceholderKey: "CardList-Demo-{*}",
      presentationDepth: 1,
    });
    const byId = new Map([
      [parent.id, parent],
      [child.id, child],
    ]);

    const parentExport = buildComponentExport(parent, 0, "2026-01-01", {
      queueItemsById: byId,
      renderingProfiles: profiles,
    });
    const childExport = buildComponentExport(child, 1, "2026-01-01", {
      queueItemsById: byId,
      renderingProfiles: profiles,
    });

    expect(parentExport?.presentation.placeHolder).toBe("headless-main");
    expect(childExport?.presentation.placeHolder).toBe("/headless-main/CardList-Demo-1");
    expect(childExport?.presentation.childPlaceholderKey).toBe("CardList-Demo-{*}");
  });

  it("resolves path-suffix placeholder for SXA parent with empty discovery keys", () => {
    const parent = makeQueueItem({
      id: "parent",
      renderingName: "CardList-Demo",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardList-Demo",
      placeholder: "headless-main",
      dynamicPlaceholderId: 1,
    });
    const child = makeQueueItem({
      id: "child",
      renderingName: "CardItem",
      renderingPath: "/sitecore/layout/Renderings/Feature/CardItem",
      parentQueueItemId: "parent",
      childPlaceholderKey: "CardList-Demo-{*}",
      presentationDepth: 1,
    });
    const byId = new Map([
      [parent.id, parent],
      [child.id, child],
    ]);
    const sxaProfiles: RenderingPlaceholderProfile[] = [
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

    const childExport = buildComponentExport(child, 1, "2026-01-01", {
      queueItemsById: byId,
      renderingProfiles: sxaProfiles,
    });

    expect(childExport?.presentation.placeHolder).toBe("/headless-main/CardList-Demo-1");
  });
});
