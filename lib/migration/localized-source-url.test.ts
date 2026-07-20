import { describe, expect, it } from "vitest";
import {
  resolveLocalizedSourceUrl,
  swapUrlLocale,
} from "@/lib/migration/localized-source-url";

const SEISMIC_EN = "https://www.seismic.com/platform/overview/";
const SEISMIC_FR = "https://www.seismic.com/fr/platform/overview/";

describe("swapUrlLocale", () => {
  it("inserts a short locale folder for regional Sitecore languages", () => {
    expect(swapUrlLocale(SEISMIC_EN, "fr-FR")).toBe(SEISMIC_FR);
  });

  it("removes the locale folder when targeting English", () => {
    expect(swapUrlLocale(SEISMIC_FR, "en")).toBe(SEISMIC_EN);
  });

  it("replaces an existing locale folder with a short code", () => {
    expect(
      swapUrlLocale(
        "https://www.example.com/en/products/overview",
        "fr-FR",
      ),
    ).toBe("https://www.example.com/fr/products/overview");
  });
});

describe("resolveLocalizedSourceUrl", () => {
  it("returns the same URL when target matches primary source language", () => {
    expect(
      resolveLocalizedSourceUrl(SEISMIC_EN, "en", {
        primarySourceLanguage: "en",
      }),
    ).toBe(SEISMIC_EN);
  });

  it("maps Seismic English overview to French overview", () => {
    expect(
      resolveLocalizedSourceUrl(SEISMIC_EN, "fr-FR", {
        primarySourceLanguage: "en",
      }),
    ).toBe(SEISMIC_FR);
  });

  it("prefers hreflang alternate URLs", () => {
    expect(
      resolveLocalizedSourceUrl(SEISMIC_EN, "fr-FR", {
        primarySourceLanguage: "en",
        alternateUrls: {
          fr: SEISMIC_FR,
        },
      }),
    ).toBe(SEISMIC_FR);
  });

  it("rebases placeholder hreflang hosts onto the crawled origin", () => {
    expect(
      resolveLocalizedSourceUrl("https://byte-canvas-eta.vercel.app/en", "fr-FR", {
        primarySourceLanguage: "en",
        alternateUrls: {
          en: "https://bytecanvas.example/en",
          fr: "https://bytecanvas.example/fr",
        },
      }),
    ).toBe("https://byte-canvas-eta.vercel.app/fr");
  });

  it("maps Seismic product-tour EN to FR locale path", () => {
    expect(
      resolveLocalizedSourceUrl(
        "https://www.seismic.com/resources/product-tour",
        "fr-FR",
        { primarySourceLanguage: "en" },
      ),
    ).toBe("https://www.seismic.com/fr/resources/product-tour");
  });
});
