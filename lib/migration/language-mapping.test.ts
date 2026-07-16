import { describe, expect, it } from "vitest";
import { expandQueueItemsForLanguages } from "@/lib/migration/expand-queue-languages";
import {
  buildLanguagePickerOptions,
  mapSourceToSitecoreLanguage,
  sanitizeSelectedLanguages,
  sourceCodesFromSitecoreLanguages,
} from "@/lib/migration/language-mapping";
import type { MigrationQueueItem } from "@/types/migration-queue";

describe("language-mapping", () => {
  const instanceLanguages = [
    { name: "en", iso: "en" },
    { name: "en-US", iso: "en-US" },
    { name: "fr-FR", iso: "fr-FR" },
    { name: "de-DE", iso: "de-DE" },
    { name: "ja-JP", iso: "ja-JP" },
  ];
  const siteLanguages = [
    { name: "en", iso: "en" },
    { name: "fr-FR", iso: "fr-FR" },
    { name: "ja-JP", iso: "ja-JP" },
  ];

  it("maps regional Sitecore languages from short source codes", () => {
    expect(
      mapSourceToSitecoreLanguage("ja", {
        siteLanguages,
      }),
    ).toBe("ja-JP");
  });

  it("marks only intersection languages as selectable", () => {
    const options = buildLanguagePickerOptions(
      instanceLanguages,
      siteLanguages,
      ["en", "fr", "ja"],
    );

    expect(options.find((entry) => entry.language.name === "en")?.selectable).toBe(
      true,
    );
    expect(options.find((entry) => entry.language.name === "fr-FR")?.selectable).toBe(
      true,
    );
    expect(options.find((entry) => entry.language.name === "ja-JP")?.selectable).toBe(
      true,
    );
    expect(options.find((entry) => entry.language.name === "de-DE")?.selectable).toBe(
      false,
    );
    expect(options.find((entry) => entry.language.name === "en-US")?.selectable).toBe(
      false,
    );
  });

  it("keeps unmatched Sitecore languages visible with hints", () => {
    const options = buildLanguagePickerOptions(
      instanceLanguages,
      siteLanguages,
      ["en"],
    );
    const german = options.find((entry) => entry.language.name === "de-DE");
    expect(german?.selectable).toBe(false);
    expect(german?.hint).toMatch(/target Sitecore site/i);
  });

  it("sanitizes selected languages to selectable only", () => {
    const options = buildLanguagePickerOptions(
      instanceLanguages,
      siteLanguages,
      ["en", "fr"],
    );
    expect(
      sanitizeSelectedLanguages(["en", "de-DE", "fr-FR"], options),
    ).toEqual(["en", "fr-FR"]);
  });

  it("always includes default en when it is on the target site", () => {
    const options = buildLanguagePickerOptions(
      instanceLanguages,
      siteLanguages,
      ["fr"],
    );
    expect(sanitizeSelectedLanguages(["fr-FR"], options)).toEqual([
      "en",
      "fr-FR",
    ]);
  });

  it("marks regional English as selectable with default-language hint", () => {
    const options = buildLanguagePickerOptions(
      instanceLanguages,
      [
        { name: "en-US", iso: "en-US" },
        { name: "fr-FR", iso: "fr-FR" },
      ],
      [],
    );
    const enUs = options.find((entry) => entry.language.name === "en-US");
    expect(enUs?.selectable).toBe(true);
    expect(enUs?.hint).toMatch(/default language/i);
  });

  it("marks fr-FR selectable when source includes fr-FR", () => {
    const options = buildLanguagePickerOptions(
      instanceLanguages,
      siteLanguages,
      ["en", "fr-FR"],
    );
    expect(
      options.find((entry) => entry.language.name === "fr-FR")?.selectable,
    ).toBe(true);
  });

  it("includes en in picker even when omitted from discovery", () => {
    const options = buildLanguagePickerOptions(
      [{ name: "fr-FR", iso: "fr-FR" }],
      [{ name: "fr-FR", iso: "fr-FR" }],
      ["fr"],
    );
    expect(options.some((entry) => entry.language.name === "en")).toBe(true);
  });

  it("builds source codes from Sitecore site languages", () => {
    expect(
      sourceCodesFromSitecoreLanguages([
        { name: "en", iso: "en" },
        { name: "fr-FR", iso: "fr-FR" },
        { name: "ja-JP", iso: "ja" },
      ]),
    ).toEqual(["en", "fr-FR", "ja", "ja-JP"]);
  });
});

describe("expandQueueItemsForLanguages", () => {
  it("expands queue items per selected language", () => {
    const item = {
      id: "1",
      languages: ["en", "fr-FR"],
    } as MigrationQueueItem;

    const expanded = expandQueueItemsForLanguages([item]);
    expect(expanded).toHaveLength(2);
    expect(expanded.map((entry) => entry.language)).toEqual(["en", "fr-FR"]);
  });

  it("expands in base-before-regional order when languages are unsorted", () => {
    const item = {
      id: "1",
      languages: ["fr-FR", "en-IN", "en"],
    } as MigrationQueueItem;

    const expanded = expandQueueItemsForLanguages([item]);
    expect(expanded.map((entry) => entry.language)).toEqual([
      "en",
      "en-IN",
      "fr-FR",
    ]);
  });
});
