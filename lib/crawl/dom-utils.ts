import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { CrawlImage, CrawlLink } from "@/types/crawl";

export const LOADING_PLACEHOLDER_PATTERN = /loading component/i;

export function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}…`;
}

export function buildSelector($: CheerioAPI, element: Element): string {
  const $element = $(element);
  const id = $element.attr("id");
  if (id) {
    return `#${id}`;
  }

  const tag = element.tagName.toLowerCase();
  const className = ($element.attr("class") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(".");

  if (className) {
    return `${tag}.${className}`;
  }

  return tag;
}

export function getHeading($: CheerioAPI, element: Element): string | undefined {
  const $element = $(element);

  const semanticHeading = $element
    .find("h1, h2, h3, h4")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (semanticHeading) {
    return semanticHeading;
  }

  const typographyHeading = $element
    .find(
      "[class*='typography-h'], [class*='typography-display'], [class*='text-h'], [class*='text-display'], [class*='text-eyebrow']",
    )
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (typographyHeading) {
    return typographyHeading;
  }

  const plainWrapper = $element
    .find("[data-component*='plaintext'], [data-component*='PlainText']")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (plainWrapper) {
    return plainWrapper;
  }

  const ariaLabel = $element.attr("aria-label")?.trim();
  if (ariaLabel) {
    return ariaLabel;
  }

  return undefined;
}

export function collectLinks($: CheerioAPI, root: Element, limit = 25): CrawlLink[] {
  const links = new Map<string, CrawlLink>();

  $(root)
    .find("a[href]")
    .each((_, anchor) => {
      const href = $(anchor).attr("href")?.trim();
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
        return;
      }

      const text = $(anchor).text().replace(/\s+/g, " ").trim();
      const key = `${href}::${text}`;
      if (!links.has(key)) {
        links.set(key, { href, text });
      }
    });

  return Array.from(links.values()).slice(0, limit);
}

export function collectImages(
  $: CheerioAPI,
  root: Element,
  limit = 20,
): CrawlImage[] {
  const images = new Map<string, CrawlImage>();

  $(root)
    .find("img[src]")
    .each((_, node) => {
      const src = $(node).attr("src")?.trim();
      if (!src) {
        return;
      }
      images.set(src, { src, alt: $(node).attr("alt")?.trim() ?? "" });
    });

  $(root)
    .find("video[src]")
    .each((_, node) => {
      const src = $(node).attr("src")?.trim();
      if (src) {
        images.set(src, { src, alt: "" });
      }
    });

  $(root)
    .find("picture source[srcset]")
    .each((_, node) => {
      const srcset = $(node).attr("srcset")?.trim();
      const src = srcset?.split(",")[0]?.trim().split(/\s+/)[0];
      if (src) {
        images.set(src, { src, alt: "" });
      }
    });

  return Array.from(images.values()).slice(0, limit);
}

export function isMeaningfulElement($: CheerioAPI, element: Element): boolean {
  const text = $(element).text().replace(/\s+/g, " ").trim();
  if (LOADING_PLACEHOLDER_PATTERN.test(text)) {
    return false;
  }

  const hasMedia =
    $(element).find("img, video, picture, a, button, input, textarea, iframe")
      .length > 0;

  return text.length >= 2 || hasMedia;
}

export function countStructuralItems($: CheerioAPI, root: Element): {
  articles: number;
  figures: number;
  blockquotes: number;
  accordionTriggers: number;
  accordionPanels: number;
  gridChildren: number;
} {
  const $root = $(root);
  const html = $root.html() ?? "";

  return {
    articles: (html.match(/<article\b/gi) ?? []).length,
    figures: (html.match(/<figure\b/gi) ?? []).length,
    blockquotes: (html.match(/<blockquote\b/gi) ?? []).length,
    accordionTriggers: $root.find('[role="button"][aria-controls]').length,
    accordionPanels: $root.find('[id*="accordion-panel"], [id*="accordion_panel"]')
      .length,
    gridChildren: pickLargestDirectGridChildren($, root).length,
  };
}

export function pickLargestDirectGridChildren(
  $: CheerioAPI,
  root: Element,
): Element[] {
  const $root = $(root);
  let best: Element[] = [];

  const containers = $root
    .find("[class*='grid'], [class*='flex'], [role='list'], ul, ol")
    .toArray()
    .filter((node): node is Element => node.type === "tag");

  for (const container of containers) {
    const children = $(container)
      .children()
      .toArray()
      .filter((node): node is Element => node.type === "tag")
      .filter((node) => isMeaningfulElement($, node));

    if (children.length >= 2 && children.length > best.length) {
      best = children;
    }
  }

  return best;
}

export function elementIdentity($: CheerioAPI, element: Element): string {
  const parent = element.parent;
  if (!parent || parent.type !== "tag") {
    return buildSelector($, element);
  }
  const index = $(parent).children().index(element);
  return `${buildSelector($, element)}@${index}`;
}
