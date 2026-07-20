import { describe, expect, it } from "vitest";
import {
  isCssSelectorSourceRegion,
  localizeFieldsFromSelectors,
  queueItemUsesVisualMapperSelectors,
} from "@/lib/migration/localize-visual-mapper-fields";
import { parseLinkFieldValue } from "@/lib/migration/link-field";
import type { EditableFieldValue } from "@/types/migration-queue";

const frenchHtml = `
<html lang="fr">
  <body>
    <section id="hero">
      <h1 class="title">Nous concevons des maisons habitées</h1>
      <p class="summary">Des rénovations complètes aux rafraîchissements.</p>
      <a class="cta" href="/fr/services">Découvrir nos services</a>
      <img class="hero-image" src="/fr/hero.jpg" alt="Salon FR" />
    </section>
  </body>
</html>
`;

describe("localize visual mapper fields", () => {
  it("detects CSS selector source regions", () => {
    expect(isCssSelectorSourceRegion("heading")).toBe(false);
    expect(isCssSelectorSourceRegion("link/cta")).toBe(false);
    expect(isCssSelectorSourceRegion("h1.title")).toBe(true);
    expect(isCssSelectorSourceRegion("#hero > a.cta")).toBe(true);
  });

  it("extracts French text and CTA from selectors", () => {
    const fields: EditableFieldValue[] = [
      {
        id: "1",
        sourceRegion: "h1.title",
        sitecoreField: "Title",
        fieldType: "Single-Line Text",
        value: "We design homes",
      },
      {
        id: "2",
        sourceRegion: "a.cta",
        sitecoreField: "Link",
        fieldType: "General Link",
        value: JSON.stringify({
          linkType: "internal",
          url: "https://byte-canvas-eta.vercel.app/en/services",
          text: "Explore our services",
          target: "",
          path: "/services",
        }),
      },
      {
        id: "3",
        sourceRegion: "img.hero-image",
        sitecoreField: "Image",
        fieldType: "Image",
        value: "https://example.com/en/hero.jpg",
      },
    ];

    expect(queueItemUsesVisualMapperSelectors(fields)).toBe(true);

    const result = localizeFieldsFromSelectors(
      fields,
      frenchHtml,
      "https://byte-canvas-eta.vercel.app/fr",
    );

    expect(result.updatedCount).toBe(3);
    expect(result.fields[0]?.value).toContain("maisons habitées");

    const link = parseLinkFieldValue(
      result.fields[1]!.value,
      "https://byte-canvas-eta.vercel.app/fr",
    );
    expect(link?.text).toBe("Découvrir nos services");
    expect(result.fields[2]?.value).toContain("/fr/hero.jpg");
    expect(result.fields[2]?.imageAlt).toBe("Salon FR");
  });
});
