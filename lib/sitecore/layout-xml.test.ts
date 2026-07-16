import { describe, expect, it } from "vitest";

import {
  buildRenderingElement,
  insertRenderingInLayoutXml,
} from "@/lib/sitecore/layout-xml";

const PLACEHOLDER = "headless-main";

function rendering(name: string): string {
  return buildRenderingElement({
    renderingId: `11111111-1111-1111-1111-11111111111${name.length}`,
    placeholder: PLACEHOLDER,
    datasourceId: `22222222-2222-2222-2222-22222222222${name.length}`,
    uid: `33333333-3333-3333-3333-33333333333${name.length}`,
  });
}

describe("insertRenderingInLayoutXml", () => {
  it("preserves queue order when appending siblings to the same placeholder", () => {
    let layoutXml: string | undefined;
    const names = ["Hero", "CardList", "Accordion"] as const;

    for (const [index, name] of names.entries()) {
      layoutXml = insertRenderingInLayoutXml(
        layoutXml,
        rendering(name),
        PLACEHOLDER,
        index,
      );
    }

    const order = [...(layoutXml ?? "").matchAll(/s:id="\{([^"]+)\}"/g)].map(
      (match) => match[1],
    );

    expect(order).toEqual([
      "11111111-1111-1111-1111-111111111114",
      "11111111-1111-1111-1111-111111111118",
      "11111111-1111-1111-1111-111111111119",
    ]);
  });

  it("inserts at sibling index 0 before existing same-placeholder renderings", () => {
    const existing = insertRenderingInLayoutXml(
      undefined,
      rendering("Existing"),
      PLACEHOLDER,
      0,
    );
    const updated = insertRenderingInLayoutXml(
      existing,
      rendering("First"),
      PLACEHOLDER,
      0,
    );

    const order = [...updated.matchAll(/s:id="\{([^"]+)\}"/g)].map(
      (match) => match[1],
    );

    expect(order[0]).toBe("11111111-1111-1111-1111-111111111115");
    expect(order[1]).toBe("11111111-1111-1111-1111-111111111118");
  });
});
