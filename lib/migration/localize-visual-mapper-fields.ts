import * as cheerio from "cheerio";
import {
  ensureLinkFieldStoredValue,
  isLinkField,
} from "@/lib/migration/link-field";
import { fieldValueFromPick } from "@/lib/visual-mapper/auto-suggest-fields";
import {
  extractContentFromElement,
  querySelectorElement,
} from "@/lib/visual-mapper/extract-from-dom";
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

/**
 * Re-extract field values from localized HTML using Visual Mapper CSS selectors.
 */
export function localizeFieldsFromSelectors(
  fields: EditableFieldValue[],
  html: string,
  localizedPageUrl: string,
): {
  fields: EditableFieldValue[];
  missingSelectors: string[];
  updatedCount: number;
} {
  const $ = cheerio.load(html);
  const missingSelectors: string[] = [];
  let updatedCount = 0;

  const nextFields = fields.map((field) => {
    const selector = field.sourceRegion.trim();
    if (!selector || !isCssSelectorSourceRegion(selector)) {
      return field;
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

    let storedValue = value;
    if (isLinkField(field.sitecoreField, field.fieldType)) {
      storedValue = ensureLinkFieldStoredValue(
        value,
        field.sitecoreField,
        field.fieldType,
        localizedPageUrl,
        content.text,
        content.linkTarget,
      );
    }

    if (!storedValue.trim()) {
      missingSelectors.push(`${field.sitecoreField} (${selector})`);
      return field;
    }

    updatedCount += 1;
    return {
      ...field,
      value: storedValue,
      imageAlt: content.alt?.trim() || field.imageAlt,
    };
  });

  return {
    fields: nextFields,
    missingSelectors,
    updatedCount,
  };
}
