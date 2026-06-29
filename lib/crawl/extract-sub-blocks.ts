import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { ContentBlock, CrawlLink, CrawlImage, SemanticBlockType } from "@/types/crawl";

const MAX_SUB_BLOCKS = 12;
const MAX_TEXT = 2000;
const MAX_HTML = 1500;

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}…`;
}

function buildSelector($: CheerioAPI, element: Element): string {
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
  return className ? `${tag}.${className}` : tag;
}

function elementIdentity($: CheerioAPI, element: Element): string {
  const parent = element.parent;
  if (!parent || parent.type !== "tag") {
    return buildSelector($, element);
  }
  const index = $(parent).children().index(element);
  return `${buildSelector($, element)}@${index}`;
}

function collectLinks($: CheerioAPI, root: Element): CrawlLink[] {
  const links = new Map<string, CrawlLink>();
  $(root)
    .find("a[href]")
    .each((_, anchor) => {
      const href = $(anchor).attr("href")?.trim();
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
        return;
      }
      const text = $(anchor).text().replace(/\s+/g, " ").trim();
      links.set(`${href}::${text}`, { href, text });
    });
  return Array.from(links.values()).slice(0, 10);
}

function collectImages($: CheerioAPI, root: Element): CrawlImage[] {
  const images = new Map<string, CrawlImage>();
  $(root)
    .find("img[src]")
    .each((_, node) => {
      const src = $(node).attr("src")?.trim();
      if (src) {
        images.set(src, { src, alt: $(node).attr("alt")?.trim() ?? "" });
      }
    });
  return Array.from(images.values()).slice(0, 8);
}

function getHeading($: CheerioAPI, element: Element): string | undefined {
  const text = $(element)
    .find("h1, h2, h3, h4")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function inferSubBlockType($: CheerioAPI, element: Element): SemanticBlockType {
  const html = $(element).html() ?? "";
  if (/<iframe[^>]+src=["'][^"']*(youtube|youtu\.be|vimeo)/i.test(html)) {
    return "video";
  }
  if (
    $(element).find("blockquote").length > 0 ||
    /testimonial|quote/i.test($(element).attr("class") ?? "")
  ) {
    return "quote";
  }
  if ($(element).is("article") || /\bcard\b/i.test($(element).attr("class") ?? "")) {
    return "card-grid";
  }
  return "rich-text";
}

function pickGridChildElements($: CheerioAPI, root: Element): Element[] {
  const $root = $(root);
  let best: Element[] = [];

  $root.find("[class*='grid'], [class*='flex']").each((_, container) => {
    if (container.type !== "tag") {
      return;
    }

    const children = $(container)
      .children()
      .toArray()
      .filter((node): node is Element => node.type === "tag")
      .filter((node) => {
        const text = $(node).text().replace(/\s+/g, " ").trim();
        return text.length >= 2 || $(node).find("img, a, video").length > 0;
      });

    if (children.length >= 2 && children.length > best.length) {
      best = children;
    }
  });

  return best.slice(0, MAX_SUB_BLOCKS);
}

function pickChildElements($: CheerioAPI, root: Element): Element[] {
  const gridChildren = pickGridChildElements($, root);
  if (gridChildren.length >= 2) {
    return gridChildren;
  }

  const $root = $(root);
  const candidates: Element[] = [];

  const selectors = [
    "article",
    "figure:has(blockquote)",
    "li[class*='card'], li > article",
    "[class*='card']:not([class*='card-grid'])",
  ];

  for (const selector of selectors) {
    $root.find(selector).each((_, node) => {
      if (node.type === "tag") {
        candidates.push(node);
      }
    });
  }

  const unique = new Map<string, Element>();
  for (const element of candidates) {
    const key = elementIdentity($, element);
    if (!unique.has(key)) {
      unique.set(key, element);
    }
  }

  return Array.from(unique.values()).slice(0, MAX_SUB_BLOCKS);
}

export function extractSubBlocks(
  $: CheerioAPI,
  parent: ContentBlock,
  rootElement: Element,
): ContentBlock[] {
  const parentType = parent.type;
  const classAndId = `${parent.selector} ${parent.heading ?? ""}`.toLowerCase();
  const isGrid =
    parentType === "card-grid" ||
    /\b(services|features|cards|grid|stories|testimonials)\b/i.test(classAndId);
  const figureCount = (parent.htmlSnippet.match(/<figure\b/gi) ?? []).length;
  const articleCount = (parent.htmlSnippet.match(/<article\b/gi) ?? []).length;
  const isMultiItem = isGrid || figureCount >= 2 || articleCount >= 2;

  if (!isMultiItem) {
    return [];
  }

  const children = pickChildElements($, rootElement);
  if (children.length < 2) {
    return [];
  }

  return children.map((element, index) => {
    const $element = $(element);
    const type = inferSubBlockType($, element);
    const text = truncate($element.text().replace(/\s+/g, " ").trim(), MAX_TEXT);

    return {
      id: `${parent.id}-sub-${index + 1}`,
      type,
      tagName: element.tagName.toLowerCase(),
      selector: `${parent.selector} > ${buildSelector($, element)}`,
      heading: getHeading($, element),
      text,
      htmlSnippet: truncate($element.html() ?? "", MAX_HTML),
      links: collectLinks($, element),
      images: collectImages($, element),
      order: parent.order,
      parentBlockId: parent.id,
    };
  });
}
