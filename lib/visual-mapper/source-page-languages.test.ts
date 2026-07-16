import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractVisualMapperSourceLanguages,
  getVisualMapperSourceLanguageCodes,
  getVisualMapperSourceLanguages,
  saveVisualMapperSourceLanguages,
} from "@/lib/visual-mapper/source-page-languages";

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("visual mapper source page languages", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    vi.stubGlobal("window", { localStorage });
  });

  it("extracts languages from the loaded page HTML and URL", () => {
    const html = `
      <html lang="fr">
        <head>
          <link rel="alternate" hreflang="en" href="https://example.com/en/about" />
          <link rel="alternate" hreflang="fr" href="https://example.com/fr/about" />
        </head>
        <body></body>
      </html>
    `;

    const languages = extractVisualMapperSourceLanguages(
      html,
      "https://example.com/fr/about",
    );

    expect(languages.detectedLanguage).toBe("fr");
    expect(languages.availableLanguages).toEqual(
      expect.arrayContaining(["fr", "en"]),
    );
  });

  it("persists and reads languages with trailing-slash URL variants", () => {
    saveVisualMapperSourceLanguages("https://example.com/de/page/", {
      detectedLanguage: "de",
      availableLanguages: ["de", "en", "fr-FR"],
    });

    expect(
      getVisualMapperSourceLanguages("https://example.com/de/page"),
    ).toEqual({
      detectedLanguage: "de",
      availableLanguages: ["de", "en", "fr-FR"],
    });
    expect(
      getVisualMapperSourceLanguageCodes("https://example.com/de/page/"),
    ).toEqual(["de", "en", "fr-FR"]);
  });
});
