import { describe, expect, it } from "vitest";
import { localizedQueueFieldTesting } from "@/lib/migration/localized-queue-fields";
import type { ContentBlock } from "@/types/crawl";

const { findContentBlock, extractValueForSourceRegion } =
  localizedQueueFieldTesting;

const block: ContentBlock = {
  id: "block-0",
  type: "hero",
  tagName: "section",
  selector: "section.hero",
  heading: "Bonjour",
  text: "Bonjour Texte du hero",
  htmlSnippet: "<section><h1>Bonjour</h1><p>Texte du hero</p></section>",
  links: [{ href: "/fr/demo", text: "Demander une démo" }],
  images: [{ src: "/fr/hero.jpg", alt: "Hero FR" }],
  order: 0,
};

describe("localized field extraction", () => {
  it("extracts heading and body text separately", () => {
    expect(extractValueForSourceRegion(block, "heading")).toBe("Bonjour");
    expect(extractValueForSourceRegion(block, "body text")).toBe(
      "Bonjour Texte du hero",
    );
  });

  it("finds blocks by id", () => {
    expect(findContentBlock([block], "block-0")?.heading).toBe("Bonjour");
  });
});
