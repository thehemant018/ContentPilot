import { describe, expect, it } from "vitest";
import { uniqueTargetPaths } from "@/lib/migration/validate-target-pages-client";

describe("validate-target-pages-client", () => {
  it("deduplicates target page paths", () => {
    expect(
      uniqueTargetPaths([
        "/sitecore/content/A/Page",
        " /sitecore/content/A/Page ",
        "/sitecore/content/B/Page",
      ]),
    ).toEqual(["/sitecore/content/A/Page", "/sitecore/content/B/Page"]);
  });
});
