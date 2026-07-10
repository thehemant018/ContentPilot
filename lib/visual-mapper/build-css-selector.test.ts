import { describe, expect, it } from "vitest";
import {
  buildNodeSelectorFromParts,
  buildSelectorFallbacks,
  escapeCssIdentifier,
  isRichTextContainerAttrs,
  preferRichTextContainerOverInteractive,
} from "@/lib/visual-mapper/build-css-selector";

describe("buildNodeSelectorFromParts", () => {
  it("prefers data-component over Tailwind classes", () => {
    expect(
      buildNodeSelectorFromParts({
        tagName: "SECTION",
        classNames: ["border-t", "border-stone-200/80", "pt-12"],
        dataComponent: "blog-rte",
      }),
    ).toBe('section[data-component="blog-rte"]');
  });

  it("prefers semantic rte class over utility classes", () => {
    expect(
      buildNodeSelectorFromParts({
        tagName: "div",
        classNames: ["rte", "mt-12", "max-w-none", "[&_p]:mb-4"],
      }),
    ).toBe("div.rte");
  });

  it("escapes Tailwind classes when needed", () => {
    const selector = buildNodeSelectorFromParts({
      tagName: "section",
      classNames: ["border-t", "border-stone-200/80", "pt-12"],
    });
    expect(selector).toContain(escapeCssIdentifier("border-stone-200/80"));
  });
});

describe("buildSelectorFallbacks", () => {
  it("recovers from broken Tailwind RTE section selectors", () => {
    const fallbacks = buildSelectorFallbacks(
      "section.border-t.border-stone-200/80.pt-12",
    );
    expect(fallbacks).toContain("div.rte");
    expect(
      fallbacks.some((item) => item.includes("border-stone-200")),
    ).toBe(true);
  });

  it("keeps data-component selectors first-class", () => {
    const fallbacks = buildSelectorFallbacks(
      'section[data-component="blog-rte"]',
    );
    expect(fallbacks[0]).toBe('section[data-component="blog-rte"]');
    expect(fallbacks).toContain('[data-component="blog-rte"]');
  });
});

describe("preferRichTextContainerOverInteractive", () => {
  it("prefers RTE over headings", () => {
    expect(
      preferRichTextContainerOverInteractive({
        hasRichTextContainer: true,
        interactiveTagName: "H2",
      }),
    ).toBe(true);
  });

  it("keeps links as precise targets", () => {
    expect(
      preferRichTextContainerOverInteractive({
        hasRichTextContainer: true,
        interactiveTagName: "A",
      }),
    ).toBe(false);
  });
});

describe("isRichTextContainerAttrs", () => {
  it("detects blog-rte and Article body landmarks", () => {
    expect(
      isRichTextContainerAttrs({ dataComponent: "blog-rte" }),
    ).toBe(true);
    expect(
      isRichTextContainerAttrs({ ariaLabel: "Article body" }),
    ).toBe(true);
  });
});
