import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import {
  findLocalizedAnchorHref,
  isLanguageSpecificSelector,
  localizeFieldsFromSelectors,
  stripLocalePrefixFromPath,
} from "@/lib/migration/localize-visual-mapper-fields";
import { parseLinkFieldValue } from "@/lib/migration/link-field";
import type { EditableFieldValue } from "@/types/migration-queue";

const SOURCE = "https://www.seismic.com/resources/product-tour";
const FR_PAGE = "https://www.seismic.com/fr/resources/product-tour/";

const frenchHtml = `
<html lang="fr">
  <body>
    <section data-component="authorable/OutcomesHero">
      <a href="/fr/get-a-demo/" aria-label="Démarrer la visite (ouvre un nouvel onglet)">Démarrer la visite</a>
      <a href="/fr/platform/overview/" aria-label="Voir la plateforme">Voir la plateforme</a>
    </section>
  </body>
</html>
`;

describe("locale-aware CTA localization", () => {
  it("detects language-specific aria-label selectors", () => {
    expect(
      isLanguageSpecificSelector(
        'a[aria-label="Start the Tour (Opens in a new tab)"]',
      ),
    ).toBe(true);
    expect(isLanguageSpecificSelector("a.cta-primary")).toBe(false);
  });

  it("strips locale prefixes for path comparison", () => {
    expect(stripLocalePrefixFromPath("/fr/get-a-demo/")).toBe("/get-a-demo/");
    expect(stripLocalePrefixFromPath("/get-a-demo")).toBe("/get-a-demo");
    expect(stripLocalePrefixFromPath("/uk/platform/overview")).toBe(
      "/platform/overview",
    );
  });

  it("pairs each EN CTA to its FR twin by path, not aria-label", () => {
    const fields: EditableFieldValue[] = [
      {
        id: "1",
        sourceRegion: 'a[aria-label="Start the Tour (Opens in a new tab)"]',
        sitecoreField: "ctaLink1",
        fieldType: "General Link",
        value: JSON.stringify({
          linkType: "internal",
          url: "https://www.seismic.com/get-a-demo/",
          text: "Start the Tour",
          target: "_blank",
          path: "/get-a-demo",
        }),
      },
      {
        id: "2",
        sourceRegion: 'a[aria-label="See the platform"]',
        sitecoreField: "ctaLink2",
        fieldType: "General Link",
        value: JSON.stringify({
          linkType: "internal",
          url: "https://www.seismic.com/platform/overview/",
          text: "See the platform",
          target: "",
          path: "/platform/overview",
        }),
      },
    ];

    const result = localizeFieldsFromSelectors(
      fields,
      frenchHtml,
      FR_PAGE,
      SOURCE,
    );

    expect(result.updatedCount).toBe(2);
    expect(result.missingSelectors).toEqual([]);

    const cta1 = parseLinkFieldValue(result.fields[0]!.value, FR_PAGE);
    const cta2 = parseLinkFieldValue(result.fields[1]!.value, FR_PAGE);

    expect(cta1?.text).toMatch(/visite/i);
    expect(cta1?.path || cta1?.url).toMatch(/get-a-demo/i);
    expect(cta2?.text).toMatch(/plateforme/i);
    expect(cta2?.path || cta2?.url).toMatch(/platform\/overview/i);

    // Must not swap the two CTAs.
    expect(cta1?.path || cta1?.url).not.toMatch(/platform\/overview/i);
    expect(cta2?.path || cta2?.url).not.toMatch(/get-a-demo/i);
  });

  it("findLocalizedAnchorHref matches FR twin for EN get-a-demo", () => {
    const $ = cheerio.load(frenchHtml);
    const match = findLocalizedAnchorHref(
      $,
      FR_PAGE,
      {
        linkType: "internal",
        url: "https://www.seismic.com/get-a-demo/",
        text: "Start the Tour",
        target: "_blank",
        path: "/get-a-demo",
      },
      SOURCE,
    );

    expect(match?.href).toMatch(/\/fr\/get-a-demo/i);
    expect(match?.text).toMatch(/visite/i);
  });
});
