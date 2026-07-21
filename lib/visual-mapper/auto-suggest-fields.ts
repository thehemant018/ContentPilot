import { buildHeuristicFieldMappings } from "@/lib/ai-match/heuristic-field-map";
import {
  buildLinkFieldAssignment,
  ensureLinkFieldStoredValue,
  formatLinkPreview,
  isLinkField,
  parseLinkFieldValue,
  rebuildLinkField,
  type LinkKind,
} from "@/lib/migration/fields/link-field";
import {
  isNextImageOptimizerUrl,
  resolveMediaSrc,
  resolveNavigationHref,
} from "@/lib/visual-mapper/resolve-extracted-url";
import type { FlatContentBlock } from "@/types/ai-match";
import type { TemplateDefinition } from "@/types/discovery";
import type {
  ExtractedContent,
  FieldAssignment,
  SelectedElement,
} from "@/types/visual-mapper";

const IMAGE_FIELD_PATTERN = /\b(image|photo|media|thumbnail|picture|banner)\b/i;
const LINK_FIELD_PATTERN = /\b(link|cta|button|url|target|href)\b/i;
const HEADING_FIELD_PATTERN = /\b(title|headline|heading|subtitle|teaser)\b/i;
const TEXT_FIELD_PATTERN = /\b(body|text|content|description|summary|copy|rte)\b/i;

function truncatePreview(value: string, max = 80): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

function fieldValueFromContent(
  fieldType: string,
  fieldName: string,
  content: ExtractedContent,
  pageUrl: string,
): { value: string; preview: string } {
  const typeLower = fieldType.toLowerCase();
  const nameLower = fieldName.toLowerCase();

  // Link/CTA fields must win over content.isImage — card CTAs often wrap <img>
  // (Next.js /_next/image src must not be stored as the General Link URL).
  if (isLinkField(fieldName, fieldType)) {
    if (!content.href?.trim()) {
      return { value: "", preview: "" };
    }
    const href = resolveNavigationHref(content.href, pageUrl);
    if (isNextImageOptimizerUrl(href)) {
      return { value: "", preview: "" };
    }
    const built = buildLinkFieldAssignment(
      href,
      pageUrl,
      content.text,
      content.linkTarget,
    );
    return { value: built.value, preview: built.valuePreview };
  }

  if (
    typeLower.includes("image") ||
    IMAGE_FIELD_PATTERN.test(nameLower) ||
    content.isImage
  ) {
    const raw =
      content.src || content.html.match(/src=["']([^"']+)["']/i)?.[1] || "";
    const src = resolveMediaSrc(raw, pageUrl);
    return { value: src, preview: src ? truncatePreview(src, 60) : "" };
  }

  if (content.isRichText || typeLower.includes("rich")) {
    return { value: content.html || content.text, preview: truncatePreview(content.text) };
  }

  return { value: content.text, preview: truncatePreview(content.text) };
}

function extractedToFlatBlock(
  element: SelectedElement,
  pageUrl: string,
): FlatContentBlock {
  const { extracted, selector } = element;
  const images =
    extracted.src || extracted.isImage
      ? [{ src: extracted.src, alt: extracted.alt || "" }]
      : [];
  const links =
    extracted.href || extracted.isLink
      ? [{ href: extracted.href, text: extracted.text }]
      : [];

  return {
    id: selector,
    pageUrl,
    pageTitle: "",
    type: extracted.isHeading
      ? "hero"
      : extracted.isImage
        ? "media"
        : extracted.isLink
          ? "cta"
          : extracted.isRichText
            ? "rich-text"
            : "unknown",
    tagName: extracted.tagName,
    selector,
    heading: extracted.isHeading ? extracted.text : undefined,
    text: extracted.text,
    htmlSnippet: extracted.html,
    images,
    links,
    order: 0,
    subBlocks: [],
  };
}

function normalizeLinkAssignment(
  assignment: FieldAssignment,
  pageUrl: string,
  linkText?: string,
): FieldAssignment {
  if (!isLinkField(assignment.sitecoreField, assignment.fieldType)) {
    return assignment;
  }

  const value = ensureLinkFieldStoredValue(
    assignment.value,
    assignment.sitecoreField,
    assignment.fieldType,
    pageUrl,
    linkText,
  );

  const parsed = parseLinkFieldValue(value, pageUrl);
  return {
    ...assignment,
    value,
    valuePreview: parsed ? formatLinkPreview(parsed, pageUrl) : assignment.valuePreview,
  };
}

export function autoSuggestFieldAssignments(
  element: SelectedElement,
  template: TemplateDefinition,
  pageUrl: string,
): FieldAssignment[] {
  const block = extractedToFlatBlock(element, pageUrl);
  const heuristicMappings = buildHeuristicFieldMappings(block, template);
  const usedFields = new Set<string>();

  const fromHeuristic: FieldAssignment[] = heuristicMappings.map((mapping) => {
    usedFields.add(mapping.sitecoreField);
    const assignment: FieldAssignment = {
      sitecoreField: mapping.sitecoreField,
      fieldType: mapping.fieldType ?? "Single-Line Text",
      sourceSelector: element.selector,
      value: mapping.sourcePreview,
      valuePreview: mapping.sourcePreview,
      assignedManually: false,
    };
    return normalizeLinkAssignment(assignment, pageUrl, element.extracted.text);
  });

  if (fromHeuristic.length > 0) {
    return fromHeuristic;
  }

  const { extracted } = element;
  const assignments: FieldAssignment[] = [];

  for (const field of template.fields) {
    if (usedFields.has(field.name)) {
      continue;
    }

    let shouldMap = false;
    if (HEADING_FIELD_PATTERN.test(field.name) && extracted.isHeading) {
      shouldMap = true;
    } else if (IMAGE_FIELD_PATTERN.test(field.name) && extracted.isImage) {
      shouldMap = true;
    } else if (LINK_FIELD_PATTERN.test(field.name) && extracted.isLink && extracted.href) {
      shouldMap = true;
    } else if (TEXT_FIELD_PATTERN.test(field.name) && extracted.text) {
      shouldMap = true;
    }

    if (!shouldMap) {
      continue;
    }

    const { value, preview } = fieldValueFromContent(
      field.type,
      field.name,
      extracted,
      pageUrl,
    );
    if (!value) {
      continue;
    }

    usedFields.add(field.name);
    assignments.push({
      sitecoreField: field.name,
      fieldType: field.type,
      sourceSelector: element.selector,
      value,
      valuePreview: preview,
      assignedManually: false,
    });
  }

  return assignments;
}

export function fieldValueFromPick(
  fieldType: string,
  fieldName: string,
  content: ExtractedContent,
  pageUrl: string,
): { value: string; preview: string } {
  return fieldValueFromContent(fieldType, fieldName, content, pageUrl);
}

export function updateLinkFieldType(
  currentValue: string,
  linkType: LinkKind,
  sourcePageUrl: string,
): { value: string; preview: string } {
  const rebuilt = rebuildLinkField(currentValue, sourcePageUrl, { linkType });
  return { value: rebuilt.value, preview: rebuilt.valuePreview };
}

export function emptyFieldAssignments(
  template: TemplateDefinition,
): FieldAssignment[] {
  return template.fields.map((field) => ({
    sitecoreField: field.name,
    fieldType: field.type,
    sourceSelector: "",
    value: "",
    valuePreview: "",
    assignedManually: false,
  }));
}

export function mergeAssignmentsWithTemplate(
  template: TemplateDefinition,
  existing: FieldAssignment[],
): FieldAssignment[] {
  const byName = new Map(existing.map((item) => [item.sitecoreField, item]));
  return template.fields.map((field) => {
    const current = byName.get(field.name);
    if (current) {
      return { ...current, fieldType: field.type };
    }
    return {
      sitecoreField: field.name,
      fieldType: field.type,
      sourceSelector: "",
      value: "",
      valuePreview: "",
      assignedManually: false,
    };
  });
}
