import { describe, expect, it } from "vitest";
import { isDirectChildItem } from "@/lib/migration/target-page";

describe("target-page", () => {
  it("detects direct child items under a parent path", () => {
    expect(
      isDirectChildItem(
        "/sitecore/content/Site/Home/Blogs",
        "/sitecore/content/Site/Home/Blogs/post-two",
      ),
    ).toBe(true);
  });

  it("rejects nested descendants", () => {
    expect(
      isDirectChildItem(
        "/sitecore/content/Site/Home/Blogs",
        "/sitecore/content/Site/Home/Blogs/post-two/Data",
      ),
    ).toBe(false);
  });

  it("rejects siblings outside the parent", () => {
    expect(
      isDirectChildItem(
        "/sitecore/content/Site/Home/Blogs",
        "/sitecore/content/Site/Home/News/post-two",
      ),
    ).toBe(false);
  });
});
