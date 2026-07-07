import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { ExtractedContent } from "@/types/visual-mapper";
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

function extractSrc($: CheerioAPI, el: CheerioElement, pageUrl: string): string {
  const img = el.is("img") ? el : el.find("img").first();
  const target = img.length > 0 ? img : el;
  const raw =
    target.attr("src") ||
    target.attr("data-src") ||
    "";
  return raw ? resolveNavigationHref(raw, pageUrl) : "";
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

  return {
    text: extractLinkText($, el),
    html: html.slice(0, 1000),
    src: extractSrc($, el, pageUrl),
    href: extractHref($, el, pageUrl),
    alt: el.attr("alt") || el.find("img").first().attr("alt") || "",
    tagName,
    isImage: tagName === "IMG" || el.find("img").length > 0,
    isLink: tagName === "A" || Boolean(linkEl),
    isHeading: /^H[1-6]$/.test(tagName),
    isRichText: tagName === "P" || (tagName === "DIV" && childCount > 1),
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
  try {
    const el = $(trimmed).first();
    return el.length > 0 ? el : null;
  } catch {
    return null;
  }
}

export function extractPageTitle($: CheerioAPI): string {
  return (
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    ""
  );
}
