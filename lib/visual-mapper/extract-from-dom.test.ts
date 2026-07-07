import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import {
  extractContentFromElement,
  extractPageTitle,
  querySelectorElement,
} from "@/lib/visual-mapper/extract-from-dom";

describe("extract-from-dom", () => {
  it("extracts text and link href from cheerio elements", () => {
    const $ = cheerio.load(
      '<a href="/about" target="_blank"><span>Learn more</span></a>',
    );
    const el = querySelectorElement($, "a");
    expect(el).not.toBeNull();
    const content = extractContentFromElement($, el!, "https://example.com");
    expect(content.text).toBe("Learn more");
    expect(content.href).toBe("https://example.com/about");
    expect(content.linkTarget).toBe("_blank");
    expect(content.isLink).toBe(true);
  });

  it("reads page title from document", () => {
    const $ = cheerio.load("<html><head><title>My Blog</title></head></html>");
    expect(extractPageTitle($)).toBe("My Blog");
  });

  it("extracts CSS background image URLs from inline styles", () => {
    const $ = cheerio.load(
      '<section style="background-image: url(\'/images/hero.jpg\')"><h1>Title</h1></section>',
    );
    const el = querySelectorElement($, "h1");
    expect(el).not.toBeNull();
    const content = extractContentFromElement($, el!, "https://example.com");
    expect(content.src).toBe("https://example.com/images/hero.jpg");
    expect(content.isImage).toBe(true);
  });
});
