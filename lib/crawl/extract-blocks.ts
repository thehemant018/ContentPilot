import { extractSubBlocks } from "@/lib/crawl/extract-sub-blocks";
import {
  buildSelector,
  collectImages,
  collectLinks,
  countStructuralItems,
  getHeading,
  isMeaningfulElement,
  LOADING_PLACEHOLDER_PATTERN,
  truncate,
} from "@/lib/crawl/dom-utils";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type {
  ContentBlock,
  SemanticBlockType,
} from "@/types/crawl";

const MAX_TEXT_LENGTH = 4000;
const MAX_HTML_SNIPPET = 2000;
const MAX_BLOCKS = 60;

function inferBlockType($: CheerioAPI, element: Element): SemanticBlockType {
  const $element = $(element);
  const tag = element.tagName.toLowerCase();
  const classAndId =
    `${$element.attr("id") ?? ""} ${$element.attr("class") ?? ""}`.toLowerCase();
  const role = $element.attr("role")?.toLowerCase() ?? "";
  const signals = countStructuralItems($, element);
  const heading = getHeading($, element) ?? "";

  if (
    tag === "nav" ||
    tag === "header" ||
    role === "navigation" ||
    /\b(nav|menu|navbar|breadcrumb)\b/.test(classAndId)
  ) {
    return "navigation";
  }

  if (
    tag === "footer" ||
    role === "contentinfo" ||
    /\bfooter\b/.test(classAndId)
  ) {
    return "footer";
  }

  if (tag === "form" || /newsletter|subscribe|contact-form/.test(classAndId)) {
    return "form";
  }

  if (
    /hero|banner|jumbotron|masthead|cloud-linear|display-1/.test(classAndId) ||
    (tag === "section" &&
      $element.find("h1, [class*='text-display'], [class*='typography-display']").length >
        0 &&
      $element.find("img, video, picture, iframe").length > 0) ||
    ($element.find("h1").length > 0 &&
      $element.find("a, button").length > 0 &&
      $element.find("img, video, picture").length > 0)
  ) {
    return "hero";
  }

  if (
    $element.find(
      'iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"], video[src]',
    ).length > 0 ||
    /video|youtube|embed|media-player/.test(classAndId)
  ) {
    return "video";
  }

  if (
    $element.find("blockquote").length > 0 ||
    /quote|testimonial|pull-quote|featured-quote|blockquote/.test(classAndId) ||
    /featured quote|pull quote/i.test(heading)
  ) {
    if (
      signals.figures <= 1 &&
      signals.articles === 0 &&
      signals.gridChildren < 2 &&
      !/stories|testimonials|cards|grid|services|features/.test(classAndId)
    ) {
      return "quote";
    }
    if (/featured.?quote|pull.?quote|quote-heading/i.test(classAndId)) {
      return "quote";
    }
  }

  const text = $element.text().replace(/\s+/g, " ").trim();

  if (
    $element.find("input[type='email'], input[type='text'], textarea").length >
      0 &&
    $element.find("button, a[href]").length > 0
  ) {
    return "cta";
  }

  if (
    signals.gridChildren >= 2 ||
    signals.articles >= 2 ||
    signals.accordionTriggers >= 2 ||
    $element.find("article, .card, [class*='card'], li > a").length >= 2 ||
    /\b(grid|cards|listing|features|services|stories|testimonials|resources|integrations|accordion|platform)\b/.test(
      classAndId,
    )
  ) {
    return "card-grid";
  }

  if (
    $element.find("img, video, picture, figure").length > 0 &&
    text.length < 120
  ) {
    return "media";
  }

  if (
    /cta|call-to-action|btn-primary|button-group/.test(classAndId) ||
    ($element.find("a, button, input[type='email']").length > 0 &&
      text.length < 280 &&
      $element.find("p").length <= 2)
  ) {
    return "cta";
  }

  if (
    tag === "article" ||
    tag === "main" ||
    $element.find("p").length > 0 ||
    /content|richtext|rte|prose|body-copy|text-body/.test(classAndId)
  ) {
    return "rich-text";
  }

  if (
    tag === "section" ||
    (tag === "div" && (heading || $element.find("h1, h2, h3, h4").length > 0))
  ) {
    return signals.accordionTriggers >= 2 ? "card-grid" : "section";
  }

  return "unknown";
}

const SEMANTIC_CHROME_SELECTOR =
  "header, footer, nav, [role='banner'], [role='contentinfo'], [role='navigation']";

const AD_SELECTOR =
  "[class*='ad-'], [class*='ads-'], [id*='ad-'], [id*='ads-'], [data-ad], [data-ad-slot], .adsbygoogle";

function isSemanticChromeTag(tag: string): boolean {
  return tag === "header" || tag === "footer" || tag === "nav";
}

function stripChromeFromDom($: CheerioAPI): void {
  $(SEMANTIC_CHROME_SELECTOR).remove();
  $(AD_SELECTOR).remove();
  $("[aria-hidden='true']").each((_, node) => {
    if (node.type !== "tag") {
      return;
    }
    const text = $(node).text().replace(/\s+/g, " ").trim();
    if (LOADING_PLACEHOLDER_PATTERN.test(text)) {
      $(node).remove();
    }
  });
}

function isExcludedChromeElement($: CheerioAPI, element: Element): boolean {
  const $element = $(element);
  const tag = element.tagName.toLowerCase();

  if (isSemanticChromeTag(tag)) {
    return true;
  }

  const role = $element.attr("role")?.toLowerCase() ?? "";
  if (role === "banner" || role === "contentinfo" || role === "navigation") {
    return true;
  }

  const classAndId =
    `${$element.attr("id") ?? ""} ${$element.attr("class") ?? ""}`.toLowerCase();
  if (
    /\b(header|footer|site-header|site-footer|page-header|page-footer|navbar|nav-bar|site-nav|main-nav|top-nav|bottom-nav|breadcrumb|breadcrumbs|global-nav|utility-nav)\b/.test(
      classAndId,
    ) ||
    /\b(navbar|nav-menu|main-menu|site-menu|top-menu)\b/.test(classAndId)
  ) {
    return true;
  }

  if (isAdElement($, element)) {
    return true;
  }

  if (
    /\b(copyright|legal|privacy|trust center|newsroom)\b/.test(classAndId) ||
    /©\s*\d{4}/.test($(element).text())
  ) {
    return true;
  }

  if ($element.closest(SEMANTIC_CHROME_SELECTOR).length > 0) {
    return true;
  }

  return false;
}

function isAdElement($: CheerioAPI, element: Element): boolean {
  const $element = $(element);
  const tag = element.tagName.toLowerCase();
  const classAndId =
    `${$element.attr("id") ?? ""} ${$element.attr("class") ?? ""}`.toLowerCase();
  const attrs = [
    $element.attr("data-ad"),
    $element.attr("data-ad-slot"),
    $element.attr("data-ad-unit"),
    $element.attr("data-ad-client"),
    $element.attr("data-google-query-id"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /\b(ad|ads|advert|advertisement|advertising|sponsored|adsbygoogle|ad-slot|ad-container|ad-wrapper|dfp-ad|google-ad|outbrain|taboola|ad-banner|ad-unit|adblock|ad-block)\b/.test(
      `${classAndId} ${attrs}`,
    ) ||
    /\bad[-_]/.test(classAndId) ||
    /[-_]ad\b/.test(classAndId)
  ) {
    return true;
  }

  if (tag === "aside" && /\b(ad|ads|sponsor|promo)\b/.test(classAndId)) {
    return true;
  }

  if ($element.closest(AD_SELECTOR).length > 0) {
    return true;
  }

  return false;
}

function shouldSkipElement($: CheerioAPI, element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (["script", "style", "noscript", "svg"].includes(tag)) {
    return true;
  }

  if (tag === "iframe" && $(element).parent().closest("section, article, main, div").length === 0) {
    return true;
  }

  const text = $(element).text().replace(/\s+/g, " ").trim();
  if (LOADING_PLACEHOLDER_PATTERN.test(text) && text.length < 80) {
    return true;
  }

  return !isMeaningfulElement($, element);
}

function isNested($: CheerioAPI, existing: Element, candidate: Element): boolean {
  return $(existing).find(candidate).length > 0;
}

function createBlock(
  $: CheerioAPI,
  element: Element,
  type: SemanticBlockType,
  order: number,
): ContentBlock {
  const $element = $(element);
  const text = truncate(
    $element.text().replace(/\s+/g, " ").trim(),
    MAX_TEXT_LENGTH,
  );

  return {
    id: `block-${order}`,
    type,
    tagName: element.tagName.toLowerCase(),
    selector: buildSelector($, element),
    heading: getHeading($, element),
    text,
    htmlSnippet: truncate($element.html() ?? "", MAX_HTML_SNIPPET),
    links: collectLinks($, element),
    images: collectImages($, element),
    order,
  };
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

function isLayoutContainer($: CheerioAPI, element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  const $element = $(element);

  if (tag === "main") {
    return $element.children("section, article, div[data-uid]").length > 0;
  }

  if (tag === "div") {
    if ($element.children("section").length > 0) {
      return true;
    }
    if (
      $element.children("main").length > 0 &&
      $element.children().length <= 2
    ) {
      return true;
    }
    if (
      $element.attr("id") === "__next" ||
      /page-wrapper|layout-wrapper|app-root/i.test($element.attr("class") ?? "")
    ) {
      return $element.children().length > 0;
    }
  }

  return false;
}

function isGridLeafCell($: CheerioAPI, element: Element): boolean {
  const parent = element.parent;
  if (!parent || parent.type !== "tag") {
    return false;
  }

  const $parent = $(parent);
  const parentClass = `${$parent.attr("class") ?? ""} ${$parent.attr("role") ?? ""}`;
  if (!/grid|flex|list/.test(parentClass)) {
    return false;
  }

  const meaningfulSiblings = $parent
    .children()
    .toArray()
    .filter((node): node is Element => node.type === "tag")
    .filter((node) => isMeaningfulElement($, node));

  return meaningfulSiblings.length >= 2;
}

function pickCandidateRoots($: CheerioAPI): Element[] {
  const selectors = [
    "main section",
    "body > section",
    "section[id]",
    "section[class*='hero'], section[class*='banner']",
    "main > article",
    "article[id]",
    "form",
    "[data-uid]",
    "#__next section",
  ].join(", ");

  let roots = $(selectors)
    .toArray()
    .filter(isElement)
    .filter((element) => !isExcludedChromeElement($, element))
    .filter((element) => !isLayoutContainer($, element))
    .filter((element) => {
      const tag = element.tagName.toLowerCase();
      if (tag === "section" || tag === "form") {
        return true;
      }
      return !isGridLeafCell($, element);
    })
    .filter((element) => !shouldSkipElement($, element));

  const sectionRoots = roots.filter(
    (element) => element.tagName.toLowerCase() === "section",
  );
  if (sectionRoots.length > 0) {
    roots = roots.filter((element) => {
      const tag = element.tagName.toLowerCase();
      if (tag !== "article" && tag !== "div") {
        return true;
      }
      return !sectionRoots.some(
        (section) => $(section).find(element).length > 0,
      );
    });
  }

  const deepest = roots.filter(
    (element) =>
      !roots.some(
        (other) => other !== element && $(element).find(other).length > 0,
      ),
  );

  if (deepest.length > 0) {
    return deepest;
  }

  if (roots.length === 0) {
    return $("body")
      .children("div, section, article")
      .toArray()
      .filter(isElement)
      .filter((element) => !isExcludedChromeElement($, element))
      .filter((element) => !isLayoutContainer($, element))
      .filter((element) => !shouldSkipElement($, element));
  }

  return roots;
}

export function extractBlocksFromHtml(html: string): ContentBlock[] {
  const $ = cheerio.load(html);
  stripChromeFromDom($);
  const seen = new Set<Element>();
  const blocks: ContentBlock[] = [];

  function addElement(element: Element, forcedType?: SemanticBlockType) {
    if (seen.has(element) || blocks.length >= MAX_BLOCKS) {
      return;
    }

    if (shouldSkipElement($, element) || isExcludedChromeElement($, element)) {
      return;
    }

    for (const existing of seen) {
      if (isNested($, existing, element)) {
        return;
      }
    }

    seen.add(element);
    const blockType = forcedType ?? inferBlockType($, element);
    const block = createBlock($, element, blockType, blocks.length + 1);
    const subBlocks = extractSubBlocks($, block, element);
    if (subBlocks.length >= 2) {
      block.subBlocks = subBlocks;
    }
    blocks.push(block);
  }

  pickCandidateRoots($).forEach((element) => addElement(element));

  if (blocks.length < 3) {
    $("body section, body article, body > div, main > div")
      .toArray()
      .filter(isElement)
      .filter((element) => !isExcludedChromeElement($, element))
      .filter((element) => !isLayoutContainer($, element))
      .filter((element) => !isGridLeafCell($, element))
      .forEach((element) => addElement(element));
  }

  return blocks.filter(
    (block) =>
      block.type !== "navigation" &&
      block.type !== "footer" &&
      !isSemanticChromeTag(block.tagName) &&
      !LOADING_PLACEHOLDER_PATTERN.test(block.text) &&
      !(
        !block.heading &&
        block.text.replace(/\s+/g, " ").trim().length < 30 &&
        block.images.length === 0
      ) &&
      !isFooterNoiseBlock(block),
  );
}

function isFooterNoiseBlock(block: ContentBlock): boolean {
  const text = block.text.toLowerCase();
  return (
    !block.heading &&
    (/copyright|privacy policy|trust center|all rights reserved|©/.test(text) ||
      (block.type === "section" && block.links.length === 0 && text.length < 80))
  );
}

export function extractPageTitle(html: string): string {
  const $ = cheerio.load(html);
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  if (ogTitle) {
    return ogTitle;
  }
  return $("title").first().text().replace(/\s+/g, " ").trim();
}

export function extractInternalLinks(
  html: string,
  baseUrl: string,
  normalizeLink: (base: string, href: string) => string | null,
): string[] {
  const $ = cheerio.load(html);
  const unique = new Set<string>();

  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href");
    if (!href) {
      return;
    }

    const normalized = normalizeLink(baseUrl, href);
    if (normalized) {
      unique.add(normalized);
    }
  });

  return Array.from(unique);
}
