import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import {
  buildLinkFieldAssignment,
  ensureLinkFieldStoredValue,
  isLinkField,
  normalizeInternalLinkPath,
  parseLinkFieldValue,
  type ParsedLinkField,
} from "@/lib/migration/fields/link-field";
import { fieldValueFromPick } from "@/lib/visual-mapper/auto-suggest-fields";
import {
  extractContentFromElement,
  querySelectorElement,
} from "@/lib/visual-mapper/extract-from-dom";
import { resolveNavigationHref } from "@/lib/visual-mapper/resolve-extracted-url";
import { swapUrlLocale } from "@/lib/migration/localize/localized-source-url";
import type { EditableFieldValue } from "@/types/migration-queue";

/** Visual Mapper stores CSS selectors in sourceRegion (e.g. h1.title, a.cta). */
export function isCssSelectorSourceRegion(sourceRegion: string): boolean {
  const region = sourceRegion.trim();
  if (!region) {
    return false;
  }

  const semanticOnly =
    /^(heading|headline|body text|description|text|image|link\/cta|link|cta|video|author|blockquote|quote|video embed)$/i;
  if (semanticOnly.test(region)) {
    return false;
  }

  return /[.#>\[\]=:]/.test(region) || /\s/.test(region);
}

export function queueItemUsesVisualMapperSelectors(
  fields: EditableFieldValue[],
): boolean {
  return fields.some((field) => isCssSelectorSourceRegion(field.sourceRegion));
}

/** Selectors that embed English copy break on translated pages. */
export function isLanguageSpecificSelector(selector: string): boolean {
  return /aria-label\s*=|\[title\s*=|text\(\)|:contains\(/i.test(selector);
}

/** Strip leading locale folder so /fr/get-a-demo and /get-a-demo compare equal. */
export function stripLocalePrefixFromPath(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const stripped = path.replace(
    /^\/[a-z]{2}(?:-[a-zA-Z]{2})?(?=\/|$)/i,
    "",
  );
  return stripped.startsWith("/") ? stripped || "/" : `/${stripped}`;
}

function hrefPathname(href: string, pageUrl: string): string | null {
  try {
    return new URL(resolveNavigationHref(href, pageUrl), pageUrl).pathname;
  } catch {
    return null;
  }
}

function pathsMatchIgnoringLocale(leftPath: string, rightPath: string): boolean {
  return (
    stripLocalePrefixFromPath(leftPath).replace(/\/$/, "") ===
    stripLocalePrefixFromPath(rightPath).replace(/\/$/, "")
  );
}

/**
 * Find the FR (or other locale) <a> whose path is the twin of the EN link path.
 * Avoids wrong CTA pairing when aria-label selectors are language-specific.
 */
export function findLocalizedAnchorHref(
  $: CheerioAPI,
  localizedPageUrl: string,
  originalLink: ParsedLinkField,
  sourcePageUrl: string,
): { href: string; text: string; target: string } | null {
  const originalHref = originalLink.path || originalLink.url;
  if (!originalHref?.trim()) {
    return null;
  }

  const originalPath =
    hrefPathname(originalHref, sourcePageUrl) ??
    normalizeInternalLinkPath(originalHref, sourcePageUrl);

  const expectedLocalizedUrl = swapUrlLocale(
    new URL(originalPath, sourcePageUrl).href,
    // Infer locale from localized page URL path when possible.
    (() => {
      try {
        const match = new URL(localizedPageUrl).pathname.match(
          /^\/([a-z]{2}(?:-[a-zA-Z]{2})?)(?=\/|$)/i,
        );
        return match?.[1] ?? "fr";
      } catch {
        return "fr";
      }
    })(),
  );
  const expectedPath =
    hrefPathname(expectedLocalizedUrl, localizedPageUrl) ??
    normalizeInternalLinkPath(expectedLocalizedUrl, localizedPageUrl);

  const anchors = $("a[href]").toArray();
  for (const node of anchors) {
    const el = $(node);
    const href = (el.attr("href") || "").trim();
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) {
      continue;
    }
    if (/\/_next\/image/i.test(href)) {
      continue;
    }

    const path = hrefPathname(href, localizedPageUrl);
    if (!path) {
      continue;
    }

    if (
      pathsMatchIgnoringLocale(path, originalPath) ||
      pathsMatchIgnoringLocale(path, expectedPath)
    ) {
      return {
        href: resolveNavigationHref(href, localizedPageUrl),
        text: (el.text() || "").replace(/\s+/g, " ").trim(),
        target: el.attr("target") || originalLink.target || "",
      };
    }
  }

  // No matching anchor on the page — still return locale-swapped URL so FR
  // versions don't keep the English href.
  return {
    href: resolveNavigationHref(expectedLocalizedUrl, localizedPageUrl),
    text: originalLink.text,
    target: originalLink.target || "",
  };
}

function localizeLinkField(
  field: EditableFieldValue,
  $: CheerioAPI,
  localizedPageUrl: string,
  sourcePageUrl: string,
): { value: string; missing: boolean } {
  const original = parseLinkFieldValue(field.value, sourcePageUrl);
  const selector = field.sourceRegion.trim();
  const languageSpecific = isLanguageSpecificSelector(selector);

  // 1) Prefer URL-twin matching when we already know the EN link destination.
  if (original && (original.linkType === "internal" || original.url)) {
    const twin = findLocalizedAnchorHref(
      $,
      localizedPageUrl,
      original,
      sourcePageUrl,
    );
    if (twin) {
      // If selector also matches and agrees on destination, prefer its text.
      if (selector && !languageSpecific) {
        const el = querySelectorElement($, selector);
        if (el) {
          const content = extractContentFromElement($, el, localizedPageUrl);
          if (
            content.href &&
            pathsMatchIgnoringLocale(
              hrefPathname(content.href, localizedPageUrl) ?? "",
              hrefPathname(twin.href, localizedPageUrl) ?? "",
            )
          ) {
            return {
              value: buildLinkFieldAssignment(
                content.href,
                localizedPageUrl,
                content.text || twin.text,
                content.linkTarget || twin.target,
              ).value,
              missing: false,
            };
          }
        }
      }

      return {
        value: buildLinkFieldAssignment(
          twin.href,
          localizedPageUrl,
          twin.text,
          twin.target,
        ).value,
        missing: false,
      };
    }
  }

  // 2) Selector-only fallback (non language-specific selectors).
  if (selector && !languageSpecific) {
    const el = querySelectorElement($, selector);
    if (el) {
      const content = extractContentFromElement($, el, localizedPageUrl);
      const { value } = fieldValueFromPick(
        field.fieldType ?? "",
        field.sitecoreField,
        content,
        localizedPageUrl,
      );
      const stored = ensureLinkFieldStoredValue(
        value,
        field.sitecoreField,
        field.fieldType,
        localizedPageUrl,
        content.text,
        content.linkTarget,
      );
      if (stored.trim()) {
        return { value: stored, missing: false };
      }
    }
  }

  return { value: field.value, missing: true };
}

/**
 * Re-extract field values from localized HTML using Visual Mapper CSS selectors.
 * Link/CTA fields are paired by destination path (locale-aware), not English aria-labels.
 */
export function localizeFieldsFromSelectors(
  fields: EditableFieldValue[],
  html: string,
  localizedPageUrl: string,
  sourcePageUrl?: string,
): {
  fields: EditableFieldValue[];
  missingSelectors: string[];
  updatedCount: number;
} {
  const $ = cheerio.load(html);
  const missingSelectors: string[] = [];
  let updatedCount = 0;
  const originPageUrl = sourcePageUrl?.trim() || localizedPageUrl;

  const nextFields = fields.map((field) => {
    const selector = field.sourceRegion.trim();
    if (!selector || !isCssSelectorSourceRegion(selector)) {
      return field;
    }

    if (isLinkField(field.sitecoreField, field.fieldType)) {
      const localized = localizeLinkField(
        field,
        $,
        localizedPageUrl,
        originPageUrl,
      );
      if (localized.missing) {
        missingSelectors.push(`${field.sitecoreField} (${selector})`);
        return field;
      }
      if (localized.value !== field.value) {
        updatedCount += 1;
      }
      return {
        ...field,
        value: localized.value,
      };
    }

    const el = querySelectorElement($, selector);
    if (!el) {
      missingSelectors.push(`${field.sitecoreField} (${selector})`);
      return field;
    }

    const content = extractContentFromElement($, el, localizedPageUrl);
    const { value } = fieldValueFromPick(
      field.fieldType ?? "",
      field.sitecoreField,
      content,
      localizedPageUrl,
    );

    if (!value.trim()) {
      missingSelectors.push(`${field.sitecoreField} (${selector})`);
      return field;
    }

    updatedCount += 1;
    return {
      ...field,
      value,
      imageAlt: content.alt?.trim() || field.imageAlt,
    };
  });

  return {
    fields: nextFields,
    missingSelectors,
    updatedCount,
  };
}

export const localizeVisualMapperFieldTesting = {
  stripLocalePrefixFromPath,
  isLanguageSpecificSelector,
  findLocalizedAnchorHref,
};
