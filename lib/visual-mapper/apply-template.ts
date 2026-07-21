import * as cheerio from "cheerio";
import { nanoid } from "nanoid";
import { ensureLinkFieldStoredValue, formatLinkPreview, isLinkField, parseLinkFieldValue } from "@/lib/migration/fields/link-field";
import { fieldValueFromPick } from "@/lib/visual-mapper/auto-suggest-fields";
import {
  extractContentFromElement,
  extractPageTitle,
  querySelectorElement,
} from "@/lib/visual-mapper/extract-from-dom";
import { fetchPageHtml } from "@/lib/visual-mapper/fetch-page-html";
import {
  extractVisualMapperSourceLanguages,
  saveVisualMapperSourceLanguages,
} from "@/lib/visual-mapper/source-page-languages";
import { resolveTargetPagePath, pageNameFromTargetPath } from "@/lib/visual-mapper/target-path-pattern";
import { componentTemplateKey } from "@/lib/visual-mapper/template-key";
import type { SourcePageLanguage } from "@/types/language";
import type {
  BulkApplyPageResult,
  BulkApplyResult,
  BulkApplyStatus,
  ComponentMappingTemplate,
  FieldAssignment,
  MappingEntry,
  PageMappingTemplate,
} from "@/types/visual-mapper";

export function buildPageMappingTemplate(
  mappings: MappingEntry[],
  templatePageUrl: string,
  options?: {
    selectedLanguages?: string[];
    languages?: SourcePageLanguage;
  },
): PageMappingTemplate {
  return {
    templatePageUrl,
    selectedLanguages: options?.selectedLanguages?.filter(Boolean),
    languages: options?.languages,
    components: mappings.map((entry) => ({
      templateKey:
        entry.templateKey ??
        componentTemplateKey(entry.renderingName, entry.sourceSelector),
      sourceSelector: entry.sourceSelector,
      renderingName: entry.renderingName,
      renderingPath: entry.renderingPath,
      templateName: entry.templateName,
      templatePath: entry.templatePath,
      fields: entry.fieldAssignments.map((field) => ({
        sitecoreField: field.sitecoreField,
        fieldType: field.fieldType,
        sourceSelector: field.sourceSelector || entry.sourceSelector,
      })),
    })),
  };
}

function resolveFieldSelector(
  component: ComponentMappingTemplate,
  fieldSourceSelector: string,
): string {
  const fieldSelector = fieldSourceSelector.trim();
  if (!fieldSelector || fieldSelector === component.sourceSelector) {
    return component.sourceSelector;
  }
  return fieldSelector;
}

function applyComponentToPage(
  $: cheerio.CheerioAPI,
  component: ComponentMappingTemplate,
  pageUrl: string,
): { entry: MappingEntry; missingFields: string[] } {
  const componentEl = querySelectorElement($, component.sourceSelector);
  const missingFields: string[] = [];
  const fieldAssignments: FieldAssignment[] = [];

  for (const field of component.fields) {
    const selector = resolveFieldSelector(component, field.sourceSelector);
    const el = querySelectorElement($, selector);

    if (!el) {
      missingFields.push(field.sitecoreField);
      fieldAssignments.push({
        sitecoreField: field.sitecoreField,
        fieldType: field.fieldType,
        sourceSelector: selector,
        value: "",
        valuePreview: "",
        assignedManually: false,
      });
      continue;
    }

    const content = extractContentFromElement($, el, pageUrl);
    const { value, preview } = fieldValueFromPick(
      field.fieldType,
      field.sitecoreField,
      content,
      pageUrl,
    );

    let storedValue = value;
    let valuePreview = preview;

    if (isLinkField(field.sitecoreField, field.fieldType)) {
      storedValue = ensureLinkFieldStoredValue(
        value,
        field.sitecoreField,
        field.fieldType,
        pageUrl,
        content.text,
      );
      const parsed = parseLinkFieldValue(storedValue, pageUrl);
      if (parsed) {
        valuePreview = formatLinkPreview(parsed, pageUrl);
      }
    }

    if (!storedValue.trim()) {
      missingFields.push(field.sitecoreField);
    }

    fieldAssignments.push({
      sitecoreField: field.sitecoreField,
      fieldType: field.fieldType,
      sourceSelector: selector,
      value: storedValue,
      valuePreview,
      assignedManually: false,
    });
  }

  const templateKey = component.templateKey;
  const entry: MappingEntry = {
    id: nanoid(),
    templateKey,
    sourceSelector: component.sourceSelector,
    sourcePageUrl: pageUrl,
    renderingName: component.renderingName,
    renderingPath: component.renderingPath,
    templateName: component.templateName,
    templatePath: component.templatePath,
    fieldAssignments,
    createdAt: new Date(),
  };

  if (!componentEl) {
    missingFields.push(`[component] ${component.renderingName}`);
  }

  return { entry, missingFields };
}

function deriveApplyStatus(
  mappings: MappingEntry[],
  missingFields: string[],
): BulkApplyStatus {
  if (mappings.length === 0) {
    return "failed";
  }

  const hasValues = mappings.some((entry) =>
    entry.fieldAssignments.some((field) => field.value.trim() !== ""),
  );

  if (!hasValues) {
    return "failed";
  }

  if (missingFields.length > 0) {
    return "partial";
  }

  return "ok";
}

export function applyTemplateToHtml(
  html: string,
  pageUrl: string,
  template: PageMappingTemplate,
  targetPagePathPattern = "",
  languages?: SourcePageLanguage,
): BulkApplyPageResult {
  const $ = cheerio.load(html);
  const mappings: MappingEntry[] = [];
  const missingFields: string[] = [];

  for (const component of template.components) {
    const { entry, missingFields: componentMissing } = applyComponentToPage(
      $,
      component,
      pageUrl,
    );
    mappings.push(entry);
    missingFields.push(...componentMissing);
  }

  const status = deriveApplyStatus(mappings, missingFields);
  const targetPagePath = resolveTargetPagePath(targetPagePathPattern, pageUrl);
  const pageLanguages =
    languages ?? extractVisualMapperSourceLanguages(html, pageUrl);

  return {
    url: pageUrl,
    status,
    mappings,
    targetPagePath,
    pageName: pageNameFromTargetPath(targetPagePath),
    missingFields: [...new Set(missingFields)],
    pageTitle: extractPageTitle($),
    languages: pageLanguages,
  };
}

export async function applyTemplateToPage(
  pageUrl: string,
  template: PageMappingTemplate,
  targetPagePathPattern = "",
): Promise<BulkApplyPageResult> {
  try {
    const html = await fetchPageHtml(pageUrl);
    const languages = extractVisualMapperSourceLanguages(html, pageUrl);
    // Client-side only; no-op on the server API route.
    saveVisualMapperSourceLanguages(pageUrl, languages);
    return applyTemplateToHtml(
      html,
      pageUrl,
      template,
      targetPagePathPattern,
      languages,
    );
  } catch (error) {
    return {
      url: pageUrl,
      status: "failed",
      mappings: [],
      targetPagePath: resolveTargetPagePath(targetPagePathPattern, pageUrl),
      pageName: pageNameFromTargetPath(
        resolveTargetPagePath(targetPagePathPattern, pageUrl),
      ),
      missingFields: [],
      pageTitle: "",
      error: error instanceof Error ? error.message : "Failed to fetch page.",
    };
  }
}

export async function applyTemplateToUrls(
  urls: string[],
  template: PageMappingTemplate,
  targetPagePathPattern = "",
): Promise<BulkApplyResult> {
  const results: BulkApplyPageResult[] = [];

  for (const [index, url] of urls.entries()) {
    if (index > 0) {
      // Pace bulk fetches so rate-limited origins are less likely to return 429.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    results.push(
      await applyTemplateToPage(url, template, targetPagePathPattern),
    );
  }

  return {
    results,
    totalUrls: urls.length,
    successCount: results.filter((item) => item.status === "ok").length,
    partialCount: results.filter((item) => item.status === "partial").length,
    failedCount: results.filter((item) => item.status === "failed").length,
  };
}

export function parseUrlList(raw: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    try {
      const normalized = new URL(trimmed).toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
      }
    } catch {
      continue;
    }
  }

  return urls;
}
