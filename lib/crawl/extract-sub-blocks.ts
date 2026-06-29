import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { ContentBlock, SemanticBlockType } from "@/types/crawl";
import {
  buildSelector,
  collectImages,
  collectLinks,
  countStructuralItems,
  elementIdentity,
  getHeading,
  isMeaningfulElement,
  pickLargestDirectGridChildren,
  truncate,
} from "@/lib/crawl/dom-utils";

const MAX_SUB_BLOCKS = 12;
const MAX_TEXT = 2000;
const MAX_HTML = 1500;

function inferSubBlockType($: CheerioAPI, element: Element): SemanticBlockType {
  const html = $(element).html() ?? "";
  const classAndId =
    `${$(element).attr("id") ?? ""} ${$(element).attr("class") ?? ""}`.toLowerCase();

  if (/<iframe[^>]+src=["'][^"']*(youtube|youtu\.be|vimeo)/i.test(html)) {
    return "video";
  }

  if (
    $(element).find("blockquote").length > 0 ||
    /testimonial|quote/i.test(classAndId)
  ) {
    return "quote";
  }

  if (
    $(element).is("article") ||
    /\bcard\b|tile|feature-item|resource|group\b/i.test(classAndId) ||
    $(element).find("img").length > 0
  ) {
    return "card-grid";
  }

  if ($(element).find('[role="button"][aria-controls]').length > 0) {
    return "rich-text";
  }

  return "rich-text";
}

function getSubBlockHeading($: CheerioAPI, element: Element): string | undefined {
  const accordionLabel = $(element)
    .find('[role="button"][aria-controls]')
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (accordionLabel) {
    return accordionLabel;
  }

  const heading = getHeading($, element);
  if (heading) {
    return heading;
  }

  const imageAlt = $(element).find("img[alt]").first().attr("alt")?.trim();
  if (imageAlt && imageAlt.length > 1) {
    return imageAlt;
  }

  return undefined;
}

function pickAccordionItems($: CheerioAPI, root: Element): Element[] {
  const $root = $(root);
  const items = new Map<string, Element>();

  $root.find('[role="button"][aria-controls]').each((_, trigger) => {
    if (trigger.type !== "tag") {
      return;
    }

    const wrapper =
      $(trigger).closest("div[class*='mt-'], div[class*='accordion'], li").get(0) ??
      trigger.parent;
    if (wrapper?.type === "tag") {
      items.set(elementIdentity($, wrapper), wrapper);
    }
  });

  if (items.size >= 2) {
    return Array.from(items.values()).slice(0, MAX_SUB_BLOCKS);
  }

  $root.find('[id*="accordion-panel"], [id*="accordion_panel"]').each((_, panel) => {
    if (panel.type !== "tag") {
      return;
    }

    const wrapper =
      $(panel).closest("div[class*='mt-'], div[class*='accordion'], li").get(0) ?? panel;
    if (wrapper.type === "tag") {
      items.set(elementIdentity($, wrapper), wrapper);
    }
  });

  return Array.from(items.values()).slice(0, MAX_SUB_BLOCKS);
}

function pickResourceTiles($: CheerioAPI, root: Element): Element[] {
  const tiles = new Map<string, Element>();

  $(root)
    .find(
      "a.group, div.group, article, [class*='resource'], [class*='tile'], [class*='card']:not([class*='card-grid'])",
    )
    .each((_, node) => {
      if (node.type !== "tag" || !isMeaningfulElement($, node)) {
        return;
      }

      const hasContent =
        $(node).find("img, h2, h3, h4, p").length > 0 ||
        $(node).text().replace(/\s+/g, " ").trim().length >= 12;
      if (!hasContent) {
        return;
      }

      tiles.set(elementIdentity($, node), node);
    });

  return Array.from(tiles.values()).slice(0, MAX_SUB_BLOCKS);
}

function pickLogoWallItems($: CheerioAPI, root: Element): Element[] {
  const items = new Map<string, Element>();

  pickLargestDirectGridChildren($, root).forEach((child) => {
    const imageCount = $(child).find("img").length;
    const textLength = $(child).text().replace(/\s+/g, " ").trim().length;
    if (imageCount > 0 && textLength < 80) {
      items.set(elementIdentity($, child), child);
    }
  });

  return Array.from(items.values()).slice(0, MAX_SUB_BLOCKS);
}

function pickChildElements($: CheerioAPI, root: Element): Element[] {
  const strategies = [
    pickAccordionItems,
    pickLargestDirectGridChildren,
    pickResourceTiles,
    pickLogoWallItems,
    pickArticleLikeElements,
  ];

  for (const strategy of strategies) {
    const children = strategy($, root);
    if (children.length >= 2) {
      return children;
    }
  }

  return [];
}

function pickArticleLikeElements($: CheerioAPI, root: Element): Element[] {
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
      if (node.type === "tag" && isMeaningfulElement($, node)) {
        candidates.push(node);
      }
    });
  }

  const unique = new Map<string, Element>();
  for (const element of candidates) {
    unique.set(elementIdentity($, element), element);
  }

  return Array.from(unique.values()).slice(0, MAX_SUB_BLOCKS);
}

function isMultiItemParent(
  $: CheerioAPI,
  parent: ContentBlock,
  rootElement: Element,
): boolean {
  if (["hero", "cta", "video", "quote", "form", "navigation", "footer"].includes(parent.type)) {
    return false;
  }

  const classAndId = `${parent.selector} ${parent.heading ?? ""}`.toLowerCase();
  const signals = countStructuralItems($, rootElement);

  if (parent.type === "card-grid") {
    return true;
  }

  if (
    /\b(services|features|cards|grid|stories|testimonials|resources|integrations|accordion|platform)\b/i.test(
      classAndId,
    )
  ) {
    return true;
  }

  if (signals.accordionTriggers >= 2 || signals.accordionPanels >= 2) {
    return true;
  }

  if (signals.articles >= 2 || signals.figures >= 2) {
    return true;
  }

  if (signals.gridChildren >= 2) {
    return true;
  }

  if (parent.type === "section" && signals.gridChildren >= 2) {
    return true;
  }

  return (
    parent.type === "rich-text" &&
    (signals.gridChildren >= 3 ||
      signals.accordionTriggers >= 2 ||
      signals.articles >= 2)
  );
}

export function extractSubBlocks(
  $: CheerioAPI,
  parent: ContentBlock,
  rootElement: Element,
): ContentBlock[] {
  if (!isMultiItemParent($, parent, rootElement)) {
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
      heading: getSubBlockHeading($, element),
      text,
      htmlSnippet: truncate($element.html() ?? "", MAX_HTML),
      links: collectLinks($, element, 10),
      images: collectImages($, element, 8),
      order: parent.order,
      parentBlockId: parent.id,
    };
  });
}
