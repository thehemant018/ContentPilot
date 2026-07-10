import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { ExtractedContent } from "@/types/visual-mapper";
import { buildSelectorFallbacks } from "@/lib/visual-mapper/build-css-selector";
import { resolveNavigationHref } from "@/lib/visual-mapper/resolve-extracted-url";

type CheerioElement = Cheerio<AnyNode>;

function findLinkElement($: CheerioAPI, el: CheerioElement): CheerioElement | null {
  if (el.is("a")) {
    return el;
  }
  const anchor = el.closest("a");
  if (anchor.length > 0) {
    return anchor;
  }
  const roleLink = el.closest("[role='link']");
  return roleLink.length > 0 ? roleLink : null;
}

function extractLinkText($: CheerioAPI, el: CheerioElement): string {
  const linkEl = findLinkElement($, el);
  if (linkEl) {
    return (linkEl.text() || "").trim().slice(0, 500);
  }
  return (el.text() || "").trim().slice(0, 500);
}

function extractHref($: CheerioAPI, el: CheerioElement, pageUrl: string): string {
  const linkEl = findLinkElement($, el);
  if (linkEl) {
    let href = linkEl.attr("href") || "";
    if (!href && linkEl.attr("role") === "link") {
      href =
        linkEl.attr("data-href") ||
        linkEl.attr("data-url") ||
        linkEl.attr("data-link") ||
        "";
    }
    return resolveNavigationHref(href, pageUrl);
  }
  const dataHref =
    el.attr("data-href") || el.attr("data-url") || el.attr("data-link") || "";
  return dataHref ? resolveNavigationHref(dataHref, pageUrl) : "";
}

function extractLinkTarget($: CheerioAPI, el: CheerioElement): string {
  const linkEl = findLinkElement($, el);
  return linkEl?.attr("target") || "";
}

function extractBackgroundImageFromStyle(
  style: string,
  pageUrl: string,
): string {
  const match = style.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
  return match?.[1] ? resolveNavigationHref(match[1], pageUrl) : "";
}

function extractBackgroundImageUrl(
  $: CheerioAPI,
  el: CheerioElement,
  pageUrl: string,
): string {
  let current: CheerioElement | null = el;

  while (current && current.length > 0 && !current.is("html")) {
    const inline = current.attr("style") || "";
    const fromInline = extractBackgroundImageFromStyle(inline, pageUrl);
    if (fromInline) {
      return fromInline;
    }

    const dataBg =
      current.attr("data-bg") ||
      current.attr("data-background") ||
      current.attr("data-background-image") ||
      "";
    if (dataBg.trim()) {
      return resolveNavigationHref(dataBg.trim(), pageUrl);
    }

    current = current.parent();
  }

  return "";
}

function extractSrc($: CheerioAPI, el: CheerioElement, pageUrl: string): string {
  const img = el.is("img") ? el : el.find("img").first();
  const target = img.length > 0 ? img : el;
  const raw =
    target.attr("src") ||
    target.attr("data-src") ||
    "";
  if (raw) {
    return resolveNavigationHref(raw, pageUrl);
  }

  return extractBackgroundImageUrl($, el, pageUrl);
}

export function extractContentFromElement(
  $: CheerioAPI,
  el: CheerioElement,
  pageUrl: string,
): ExtractedContent {
  const tagName = (el.prop("tagName") || "DIV").toString().toUpperCase();
  const linkEl = findLinkElement($, el);
  const html = el.html() || "";
  const childCount = el.children().length;
  const backgroundSrc = extractBackgroundImageUrl($, el, pageUrl);
  const src = extractSrc($, el, pageUrl);
  const hasImgChild = tagName === "IMG" || el.find("img").length > 0;
  const classNames = (el.attr("class") || "").split(/\s+/).filter(Boolean);
  const dataComponent = el.attr("data-component") || "";
  const ariaLabel = el.attr("aria-label") || "";
  const isRichTextContainer =
    classNames.some((name) =>
      /^(rte|rich-?text|richtext|wysiwyg|prose)$/i.test(name),
    ) ||
    /rte|rich-?text|article-?body|blog-?body|blog-?rte/i.test(dataComponent) ||
    /article body|rich text|main content/i.test(ariaLabel);

  return {
    text: extractLinkText($, el),
    html: html.slice(0, isRichTextContainer ? 100_000 : 1000),
    src,
    href: extractHref($, el, pageUrl),
    alt: el.attr("alt") || el.find("img").first().attr("alt") || "",
    tagName,
    isImage: hasImgChild || Boolean(backgroundSrc),
    isLink: tagName === "A" || Boolean(linkEl),
    isHeading: /^H[1-6]$/.test(tagName),
    isRichText:
      isRichTextContainer ||
      tagName === "P" ||
      (tagName === "DIV" && childCount > 1),
    linkTarget: extractLinkTarget($, el),
  };
}

export function querySelectorElement(
  $: CheerioAPI,
  selector: string,
): CheerioElement | null {
  const trimmed = selector.trim();
  if (!trimmed) {
    return null;
  }

  for (const candidate of buildSelectorFallbacks(trimmed)) {
    try {
      const el = $(candidate).first();
      if (el.length > 0) {
        return el;
      }
    } catch {
      // try next fallback
    }
  }

  return null;
}

export function extractPageTitle($: CheerioAPI): string {
  return (
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    ""
  );
}
