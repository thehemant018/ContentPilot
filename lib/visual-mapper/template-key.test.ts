import { describe, expect, it } from "vitest";
import { mappingEntryBlockId } from "@/lib/visual-mapper/template-key";

describe("template-key", () => {
  it("uses templateKey as stable block id when present", () => {
    expect(
      mappingEntryBlockId({
        id: "random-id",
        templateKey: "Blog Hero::section.hero",
      }),
    ).toBe("Blog Hero::section.hero");
  });

  it("falls back to entry id", () => {
    expect(mappingEntryBlockId({ id: "random-id" })).toBe("random-id");
  });
});
