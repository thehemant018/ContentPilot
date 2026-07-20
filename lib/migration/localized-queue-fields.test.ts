import { describe, expect, it } from "vitest";
import { localizedQueueFieldTesting } from "@/lib/migration/localized-queue-fields";
import { parseLinkFieldValue } from "@/lib/migration/link-field";
import type { ContentBlock } from "@/types/crawl";
import type { EditableFieldValue } from "@/types/migration-queue";

const { findContentBlock, extractValueForSourceRegion, localizeFieldValues } =
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

  it("localizes CTA fields with both href and label", () => {
    const fields: EditableFieldValue[] = [
      {
        id: "f1",
        sourceRegion: "heading",
        sitecoreField: "Title",
        fieldType: "Single-Line Text",
        value: "Hello",
      },
      {
        id: "f2",
        sourceRegion: "link/cta",
        sitecoreField: "Link",
        fieldType: "General Link",
        value: JSON.stringify({
          linkType: "internal",
          url: "https://example.com/en/demo",
          text: "Get a demo",
          target: "",
          path: "/demo",
        }),
      },
    ];

    const localized = localizeFieldValues(
      fields,
      block,
      "https://example.com/fr",
    );
    expect(localized[0]?.value).toBe("Bonjour");

    const link = parseLinkFieldValue(
      localized[1]!.value,
      "https://example.com/fr",
    );
    expect(link?.text).toBe("Demander une démo");
    expect(link?.path || link?.url).toMatch(/demo/i);
  });
});
