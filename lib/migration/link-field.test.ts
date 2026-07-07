import { describe, expect, it } from "vitest";
import {
  buildLinkFieldAssignment,
  classifyLinkKind,
  deriveSitecorePathFromInternalUrl,
  ensureLinkFieldStoredValue,
  formatSitecoreGeneralLink,
  isLinkField,
  normalizeInternalLinkPath,
  parseLinkFieldValue,
} from "@/lib/migration/link-field";

const SOURCE = "https://www.seismic.com/platform/overview/";

describe("link-field", () => {
  it("classifies same-origin paths as internal", () => {
    expect(classifyLinkKind("/get-a-demo", SOURCE)).toBe("internal");
    expect(classifyLinkKind("https://www.seismic.com/get-a-demo", SOURCE)).toBe(
      "internal",
    );
  });

  it("classifies other domains as external", () => {
    expect(classifyLinkKind("https://example.com/page", SOURCE)).toBe(
      "external",
    );
  });

  it("formats external Sitecore link XML", () => {
    const xml = formatSitecoreGeneralLink({
      linkType: "external",
      url: "https://www.seismic.com/get-a-demo",
      text: "Get a Demo",
      target: "_blank",
    });
    expect(xml).toContain('linktype="external"');
    expect(xml).toContain('url="https://www.seismic.com/get-a-demo"');
    expect(xml).toContain('text="Get a Demo"');
  });

  it("formats internal Sitecore link XML with item id", () => {
    const xml = formatSitecoreGeneralLink(
      {
        linkType: "internal",
        url: "/get-a-demo",
        text: "Demo",
        target: "",
        path: "/get-a-demo",
      },
      "512BD825A5D74585ADF1D8BBF8844036",
    );
    expect(xml).toContain('linktype="internal"');
    expect(xml).toContain("{512BD825-A5D7-4585-ADF1-D8BBF8844036}");
  });

  it("serializes and parses link field JSON", () => {
    const built = buildLinkFieldAssignment(
      "/get-a-demo",
      SOURCE,
      "Get a Demo",
      "",
    );
    const parsed = parseLinkFieldValue(built.value, SOURCE);
    expect(parsed?.linkType).toBe("internal");
    expect(parsed?.text).toBe("Get a Demo");
  });

  it("does not treat video url fields as link fields", () => {
    expect(isLinkField("Video URL", "Single-Line Text")).toBe(false);
    expect(isLinkField("CTA Link", "General Link")).toBe(true);
  });

  it("normalizes Sitecore dotted locale paths like /en.home", () => {
    expect(
      normalizeInternalLinkPath("/en.home", "https://www.dpworld.com/en"),
    ).toBe("/home");
    expect(
      normalizeInternalLinkPath("/en.contact-us", "https://www.dpworld.com/en"),
    ).toBe("/contact-us");
  });

  it("strips locale folder prefix from internal paths", () => {
    expect(
      normalizeInternalLinkPath("/en/about", "https://www.dpworld.com/en"),
    ).toBe("/about");
  });

  it("formats link preview without locale noise", () => {
    const built = buildLinkFieldAssignment(
      "/en.home",
      "https://www.dpworld.com/en",
      "Home",
    );
    expect(built.valuePreview).toContain("→ /home");
    expect(built.valuePreview).not.toContain("en.home");
  });

  it("ensureLinkFieldStoredValue serializes plain URLs", () => {
    const value = ensureLinkFieldStoredValue(
      "https://example.com/contact",
      "CTA Link",
      "General Link",
      SOURCE,
      "Contact Us",
    );
    expect(value).toContain('"linkType":"external"');
    expect(value).toContain("example.com/contact");
  });

  it("derives Sitecore path from dotted locale internal URLs", () => {
    const path = deriveSitecorePathFromInternalUrl(
      "/en.home",
      "/sitecore/content/DPWorld/Home/DPWorld/Home",
    );
    expect(path).toContain("/home");
    expect(path).not.toContain("en.home");
  });
});
