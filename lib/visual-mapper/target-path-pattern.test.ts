import { describe, expect, it } from "vitest";
import {
  extractUrlSlug,
  pageNameFromTargetPath,
  resolveTargetPagePath,
  slugToPageItemName,
} from "@/lib/visual-mapper/target-path-pattern";

describe("target-path-pattern", () => {
  it("resolves slug and locale placeholders", () => {
    expect(
      resolveTargetPagePath(
        "/sitecore/content/Site/{locale}/Blog/{slug}",
        "https://www.example.com/en/blog/my-post",
      ),
    ).toBe("/sitecore/content/Site/en/Blog/my-post");
  });

  it("appends slug when pattern has no placeholders", () => {
    expect(
      resolveTargetPagePath(
        "/sitecore/content/Site/Home/Blogs",
        "https://example.com/blog/post-two",
      ),
    ).toBe("/sitecore/content/Site/Home/Blogs/post-two");
  });

  it("sanitizes slug for Sitecore item names", () => {
    expect(
      resolveTargetPagePath(
        "/sitecore/content/Site/Blog/{slug}",
        "https://example.com/blog/my-cool-post",
      ),
    ).toBe("/sitecore/content/Site/Blog/my-cool-post");
  });

  it("extracts raw slug from URL", () => {
    expect(extractUrlSlug("https://example.com/en/blog/hello-world")).toBe(
      "hello-world",
    );
  });

  it("derives page name from target path", () => {
    expect(
      pageNameFromTargetPath("/sitecore/content/Site/Home/Blogs/post-two"),
    ).toBe("post-two");
  });

  it("falls back when slug is empty", () => {
    expect(slugToPageItemName("")).toBe("page");
  });
});
