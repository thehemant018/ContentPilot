import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type {
  ContentBlock,
  CrawlImage,
  CrawlLink,
  SemanticBlockType,
} from "@/types/crawl";

const MAX_TEXT_LENGTH = 4000;
const MAX_HTML_SNIPPET = 2000;
const MAX_BLOCKS = 60;

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

  if (className) {
    return `${tag}.${className}`;
  }

  return tag;
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
      const key = `${href}::${text}`;
      if (!links.has(key)) {
        links.set(key, { href, text });
      }
    });

  return Array.from(links.values()).slice(0, 25);
}

function collectImages($: CheerioAPI, root: Element): CrawlImage[] {
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

  return Array.from(images.values()).slice(0, 20);
}

function inferBlockType($: CheerioAPI, element: Element): SemanticBlockType {
  const $element = $(element);
  const tag = element.tagName.toLowerCase();
  const classAndId = `${$element.attr("id") ?? ""} ${$element.attr("class") ?? ""}`.toLowerCase();
  const role = $element.attr("role")?.toLowerCase() ?? "";

  if (
    tag === "nav" ||
    tag === "header" ||
    role === "navigation" ||
    /nav|menu|navbar/.test(classAndId)
  ) {
    return "navigation";
  }

  if (
    tag === "footer" ||
    role === "contentinfo" ||
    /footer/.test(classAndId)
  ) {
    return "footer";
  }

  if (tag === "form" || /newsletter|subscribe|contact-form/.test(classAndId)) {
    return "form";
  }

  if (
    /hero|banner|jumbotron|masthead/.test(classAndId) ||
    (tag === "section" &&
      $element.find("h1").length > 0 &&
      $element.find("img, video, picture").length > 0)
  ) {
    return "hero";
  }

  const cards = $element.find("article, .card, [class*='card'], li > a");
  if (cards.length >= 3 && /grid|cards|listing|features/.test(classAndId)) {
    return "card-grid";
  }

  const text = $element.text().replace(/\s+/g, " ").trim();
  if (
    $element.find("img, video, picture, figure").length > 0 &&
    text.length < 120
  ) {
    return "media";
  }

  if (
    /cta|call-to-action|btn-primary|button-group/.test(classAndId) ||
    ($element.find("a, button").length > 0 &&
      text.length < 220 &&
      $element.find("p").length === 0)
  ) {
    return "cta";
  }

  if (
    tag === "article" ||
    tag === "main" ||
    $element.find("p").length > 0 ||
    /content|richtext|prose|body-copy/.test(classAndId)
  ) {
    return "rich-text";
  }

  if (tag === "section") {
    return "section";
  }

  return "unknown";
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
    $element.closest(SEMANTIC_CHROME_SELECTOR).length > 0
  ) {
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

  if (
    $element.closest(AD_SELECTOR).length > 0
  ) {
    return true;
  }

  return false;
}

function shouldSkipElement($: CheerioAPI, element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (["script", "style", "noscript", "svg", "iframe"].includes(tag)) {
    return true;
  }

  const text = $(element).text().replace(/\s+/g, " ").trim();
  const hasMedia =
    $(element).find("img, video, picture, a, button, input, textarea").length >
    0;

  return text.length < 2 && !hasMedia;
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
  const text = truncate($element.text().replace(/\s+/g, " ").trim(), MAX_TEXT_LENGTH);

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

function pickCandidateRoots($: CheerioAPI): Element[] {
  const selectors = [
    "main",
    "section",
    "article",
    "form",
    ".hero, [class*='hero'], [class*='banner']",
    "[class*='card-grid'], [class*='cards'], [class*='features']",
  ].join(", ");

  const roots = $(selectors)
    .toArray()
    .filter(isElement)
    .filter((element) => !isExcludedChromeElement($, element));

  if (roots.length === 0) {
    return $("body")
      .children()
      .toArray()
      .filter(isElement)
      .filter((element) => !isExcludedChromeElement($, element));
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

    if (shouldSkipElement($, element)) {
      return;
    }

    if (isExcludedChromeElement($, element)) {
      return;
    }

    for (const existing of seen) {
      if (isNested($, existing, element)) {
        return;
      }
    }

    seen.add(element);
    blocks.push(
      createBlock(
        $,
        element,
        forcedType ?? inferBlockType($, element),
        blocks.length + 1,
      ),
    );
  }

  pickCandidateRoots($).forEach((element) => addElement(element));

  if (blocks.length < 3) {
    $("body > div, body > section, body > article")
      .toArray()
      .filter(isElement)
      .filter((element) => !isExcludedChromeElement($, element))
      .forEach((element) => addElement(element));
  }

  return blocks.filter(
    (block) =>
      block.type !== "navigation" &&
      block.type !== "footer" &&
      !isSemanticChromeTag(block.tagName),
  );
}

export function extractPageTitle(html: string): string {
  const $ = cheerio.load(html);
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
