import { describe, expect, it } from "vitest";
import { buildVersionSourceLanguageCandidates } from "@/lib/sitecore/item-version";
import { isMissingItemLanguageVersionError } from "@/lib/sitecore/graphql-client";
import { sortLanguagesForMigration } from "@/lib/migration/language-mapping";

describe("buildVersionSourceLanguageCandidates", () => {
  it("prefers queue languages other than the target", () => {
    expect(
      buildVersionSourceLanguageCandidates("en-IN", ["en-IN", "en", "fr-FR"]),
    ).toEqual(expect.arrayContaining(["en", "fr-FR"]));
    expect(
      buildVersionSourceLanguageCandidates("en-IN", ["en-IN", "en", "fr-FR"]),
    ).not.toContain("en-IN");
  });

  it("includes en fallbacks for regional targets", () => {
    expect(buildVersionSourceLanguageCandidates("fr-FR", [])).toEqual(
      expect.arrayContaining(["en", "fr"]),
    );
  });
});

describe("isMissingItemLanguageVersionError", () => {
  it("detects Sitecore missing-version GraphQL errors", () => {
    expect(
      isMissingItemLanguageVersionError(
        "The item '651fd0dd-76c7-4a17-8af3-1faaf7cf368c' does not contain version # in 'en-IN' language",
      ),
    ).toBe(true);
    expect(isMissingItemLanguageVersionError("Item not found")).toBe(false);
  });
});

describe("sortLanguagesForMigration", () => {
  it("orders base languages before regional variants", () => {
    expect(sortLanguagesForMigration(["fr-FR", "en-IN", "en"])).toEqual([
      "en",
      "en-IN",
      "fr-FR",
    ]);
  });
});
