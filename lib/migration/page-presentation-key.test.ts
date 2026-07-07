import { describe, expect, it } from "vitest";
import { pagePresentationKey, splitPagePresentationKey } from "@/lib/migration/page-presentation-key";

describe("page-presentation-key", () => {
  it("combines page path and language", () => {
    expect(
      pagePresentationKey("/sitecore/content/Site/Home", "fr-FR"),
    ).toBe("/sitecore/content/Site/Home::fr-FR");
  });

  it("splits combined keys", () => {
    expect(
      splitPagePresentationKey("/sitecore/content/Site/Home::en-US"),
    ).toEqual({
      pagePath: "/sitecore/content/Site/Home",
      language: "en-US",
    });
  });
});
