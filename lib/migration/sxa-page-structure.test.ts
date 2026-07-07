import { describe, expect, it } from "vitest";
import {
  DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH,
  SXA_PAGE_DATA_ITEM_NAME,
} from "@/lib/migration/sxa-page-structure";
import { buildSxaDatasourceParentPath } from "@/lib/sitecore/item-lookup";

describe("sxa-page-structure", () => {
  it("uses standard SXA Page Data template path by default", () => {
    expect(DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH).toContain("Page Data");
    expect(SXA_PAGE_DATA_ITEM_NAME).toBe("Data");
  });

  it("builds Data parent path under target page", () => {
    expect(buildSxaDatasourceParentPath("/sitecore/content/Site/Home/Blog/Post")).toBe(
      "/sitecore/content/Site/Home/Blog/Post/Data",
    );
  });
});
