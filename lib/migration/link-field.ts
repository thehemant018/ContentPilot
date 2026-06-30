/**
 * Sitecore General Link field helpers — classify internal/external URLs and format XML.
 */

import { formatSitecoreGuid } from "@/lib/sitecore/layout-xml";

export type LinkKind = "internal" | "external" | "anchor" | "mailto" | "tel";

export interface ParsedLinkField {
  linkType: LinkKind;
  url: string;
  text: string;
  target: string;
  /** URL path for internal links (e.g. /get-a-demo). */
  path?: string;
}

const LOCALE_SEGMENT = /^(\/[a-z]{2}(?:-[a-zA-Z]{2})?)(?:\/|$)/i;
const DOT_LOCALE_PATH =
  /^\/([a-z]{2}(?:-[a-zA-Z]{2})?)\.([a-z0-9][-a-z0-9]*)\/?$/i;
const LINK_FIELD_JSON_PREFIX = "{";

/** Locale folder from source page URL, e.g. https://site.com/en → /en */
export function extractLocalePrefixFromPageUrl(sourcePageUrl: string): string | null {
  try {
    const pathname = new URL(sourcePageUrl).pathname.replace(/\/$/, "") || "/";
    const match = pathname.match(LOCALE_SEGMENT);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Clean internal link paths for display and Sitecore resolution.
 * e.g. /en.home → /home, /en/about → /about (when source is under /en)
 */
export function normalizeInternalLinkPath(
  rawPath: string,
  sourcePageUrl?: string,
): string {
  let path = rawPath.trim();
  if (!path) {
    return "/";
  }

  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return path;
    }
  }

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  // Sitecore/JSS dotted locale paths: /en.home, /en.contact-us
  path = path.replace(DOT_LOCALE_PATH, "/$2");

  const localePrefix = sourcePageUrl
    ? extractLocalePrefixFromPageUrl(sourcePageUrl)
    : null;
  if (localePrefix && (path === localePrefix || path.startsWith(`${localePrefix}/`))) {
    path = path.slice(localePrefix.length) || "/";
  }

  path = path.replace(/\/+/g, "/");
  if (path.length > 1) {
    path = path.replace(/\/$/, "");
  }

  return path || "/";
}

export function formatInternalLinkDisplayPath(
  path: string,
  sourcePageUrl?: string,
): string {
  const normalized = normalizeInternalLinkPath(path, sourcePageUrl);
  return normalized === "/" ? "/" : normalized;
}

export function isLinkField(fieldName: string, fieldType?: string): boolean {
  const typeLower = fieldType?.toLowerCase() ?? "";
  const nameLower = fieldName.toLowerCase();

  if (typeLower.includes("general link") || /\blink\b/i.test(typeLower)) {
    return !typeLower.includes("linklist");
  }

  if (/\b(video|image|media|src)\b/i.test(nameLower)) {
    return false;
  }

  return /\b(link|cta|href|button)\b/i.test(nameLower);
}

export function ensureLinkFieldStoredValue(
  raw: string,
  fieldName: string,
  fieldType: string | undefined,
  sourcePageUrl: string,
  linkText?: string,
  target?: string,
): string {
  if (!raw.trim() || !isLinkField(fieldName, fieldType)) {
    return raw;
  }

  if (raw.trim().startsWith(LINK_FIELD_JSON_PREFIX)) {
    const parsed = parseLinkFieldValue(raw, sourcePageUrl);
    if (parsed) {
      return serializeLinkFieldValue(parsed);
    }
  }

  if (raw.trim().startsWith("<link")) {
    return raw;
  }

  const href = raw.trim();
  return buildLinkFieldAssignment(href, sourcePageUrl, linkText, target).value;
}

export function classifyLinkKind(
  href: string,
  sourcePageUrl: string,
): LinkKind {
  const trimmed = href.trim();
  if (!trimmed) {
    return "external";
  }
  if (trimmed.startsWith("#")) {
    return "anchor";
  }
  if (/^mailto:/i.test(trimmed)) {
    return "mailto";
  }
  if (/^tel:/i.test(trimmed)) {
    return "tel";
  }

  try {
    const linkUrl = new URL(trimmed, sourcePageUrl);
    const pageUrl = new URL(sourcePageUrl);
    if (linkUrl.origin === pageUrl.origin) {
      return "internal";
    }
  } catch {
    if (trimmed.startsWith("/")) {
      return "internal";
    }
  }

  return "external";
}

export function parseLinkFromHref(
  href: string,
  sourcePageUrl: string,
  options?: {
    text?: string;
    target?: string;
    linkType?: LinkKind;
  },
): ParsedLinkField {
  const trimmed = href.trim();
  const linkType = options?.linkType ?? classifyLinkKind(trimmed, sourcePageUrl);
  const text = options?.text?.trim() ?? "";

  let url = trimmed;
  let path: string | undefined;

  if (linkType === "internal" && trimmed) {
    try {
      const resolved = new URL(trimmed, sourcePageUrl);
      path = normalizeInternalLinkPath(
        resolved.pathname.replace(/\/$/, "") || "/",
        sourcePageUrl,
      );
      url = resolved.href;
    } catch {
      path = normalizeInternalLinkPath(
        trimmed.startsWith("/") ? trimmed : `/${trimmed}`,
        sourcePageUrl,
      );
      try {
        url = new URL(path, sourcePageUrl).href;
      } catch {
        url = trimmed;
      }
    }
  }

  return {
    linkType,
    url,
    text,
    target: options?.target?.trim() ?? "",
    path: linkType === "internal" ? path : undefined,
  };
}

export function serializeLinkFieldValue(link: ParsedLinkField): string {
  return JSON.stringify(link);
}

export function parseLinkFieldValue(
  raw: string,
  sourcePageUrl: string,
): ParsedLinkField | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(LINK_FIELD_JSON_PREFIX)) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<ParsedLinkField>;
      if (parsed.url && parsed.linkType) {
        return {
          linkType: parsed.linkType,
          url: parsed.url,
          text: parsed.text ?? "",
          target: parsed.target ?? "",
          path:
            parsed.linkType === "internal" && parsed.path
              ? normalizeInternalLinkPath(parsed.path, sourcePageUrl)
              : parsed.path,
        };
      }
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("<link")) {
    return parseSitecoreLinkXml(trimmed);
  }

  return parseLinkFromHref(trimmed, sourcePageUrl);
}

export function parseSitecoreLinkXml(xml: string): ParsedLinkField | null {
  const linktype = xml.match(/linktype="([^"]+)"/i)?.[1]?.toLowerCase();
  const url = xml.match(/\burl="([^"]*)"/i)?.[1] ?? "";
  const text = xml.match(/\btext="([^"]*)"/i)?.[1] ?? "";
  const target = xml.match(/\btarget="([^"]*)"/i)?.[1] ?? "";
  const id = xml.match(/\bid="([^"]*)"/i)?.[1];

  if (linktype === "internal" && id) {
    return {
      linkType: "internal",
      url: id,
      text,
      target,
    };
  }

  if (linktype === "external" || url) {
    return {
      linkType: "external",
      url,
      text,
      target,
    };
  }

  return null;
}

export function formatLinkPreview(
  link: ParsedLinkField,
  sourcePageUrl?: string,
): string {
  const label =
    link.linkType === "internal"
      ? "Internal"
      : link.linkType === "external"
        ? "External"
        : link.linkType.charAt(0).toUpperCase() + link.linkType.slice(1);

  const destination =
    link.linkType === "internal"
      ? formatInternalLinkDisplayPath(link.path || link.url, sourcePageUrl)
      : link.url;

  const textPart = link.text ? ` "${link.text}"` : "";
  return `${label}${textPart} → ${destination}`;
}

/** Guess Sitecore item path for an internal URL using the target page's site root. */
export function deriveSitecorePathFromInternalUrl(
  urlPath: string,
  targetPagePath: string,
): string {
  const normalizedPath = normalizeInternalLinkPath(urlPath);
  const slug = normalizedPath
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean)
    .join("/");

  if (!slug) {
    return targetPagePath.replace(/\/$/, "");
  }

  const pageSegments = targetPagePath.replace(/\/$/, "").split("/").filter(Boolean);
  const siteRoot =
    pageSegments.length >= 4
      ? `/${pageSegments.slice(0, 4).join("/")}`
      : targetPagePath.replace(/\/[^/]+$/, "");

  return `${siteRoot}/${slug}`;
}

export function formatSitecoreGeneralLink(
  link: ParsedLinkField,
  resolvedItemId?: string,
): string {
  const text = escapeXmlAttr(link.text);
  const target = escapeXmlAttr(link.target);

  if (link.linkType === "internal" && resolvedItemId) {
    return `<link text="${text}" linktype="internal" id="${formatSitecoreGuid(resolvedItemId)}" querystring="" target="${target}" />`;
  }

  if (link.linkType === "anchor") {
    const anchor = link.url.startsWith("#") ? link.url : `#${link.url}`;
    return `<link text="${text}" linktype="anchor" url="${escapeXmlAttr(anchor)}" anchor="" target="${target}" />`;
  }

  if (link.linkType === "mailto") {
    return `<link text="${text}" linktype="mailto" url="${escapeXmlAttr(link.url)}" anchor="" target="${target}" />`;
  }

  if (link.linkType === "tel") {
    return `<link text="${text}" linktype="external" url="${escapeXmlAttr(link.url)}" anchor="" target="${target}" />`;
  }

  return `<link text="${text}" linktype="external" url="${escapeXmlAttr(link.url)}" anchor="" target="${target}" />`;
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function buildLinkFieldAssignment(
  href: string,
  sourcePageUrl: string,
  linkText?: string,
  target?: string,
): { value: string; valuePreview: string } {
  const trimmedHref = href.trim();
  if (!trimmedHref) {
    return { value: "", valuePreview: "" };
  }

  const parsed = parseLinkFromHref(trimmedHref, sourcePageUrl, {
    text: linkText?.trim() || "",
    target,
  });
  return {
    value: serializeLinkFieldValue(parsed),
    valuePreview: formatLinkPreview(parsed, sourcePageUrl),
  };
}

export function rebuildLinkField(
  currentValue: string,
  sourcePageUrl: string,
  updates: Partial<Pick<ParsedLinkField, "url" | "text" | "target" | "linkType">>,
): { value: string; valuePreview: string } {
  const parsed =
    parseLinkFieldValue(currentValue, sourcePageUrl) ??
    parseLinkFromHref("", sourcePageUrl);

  const next: ParsedLinkField = {
    ...parsed,
    ...updates,
  };

  if (updates.url) {
    const reclassified = parseLinkFromHref(updates.url, sourcePageUrl, {
      text: next.text,
      target: next.target,
      linkType: next.linkType,
    });
    return {
      value: serializeLinkFieldValue(reclassified),
      valuePreview: formatLinkPreview(reclassified, sourcePageUrl),
    };
  }

  return {
    value: serializeLinkFieldValue(next),
    valuePreview: formatLinkPreview(next, sourcePageUrl),
  };
}
