import { blockTypeKeywords } from "@/lib/ai-match/block-keywords";
import {
  describeBlockSignals,
  inferMatchingBlockType,
} from "@/lib/ai-match/block-intent";
import { isDatasourceTemplate } from "@/lib/sitecore/discovery/slim-result";
import type { FlatContentBlock } from "@/types/ai-match";
import type { DiscoveryItem, TemplateDefinition } from "@/types/discovery";

const BLOCKS_PER_PASS = 12;
const MAX_BLOCKS_PER_RUN = 24;
const FIELDS_PER_PASS = 4;
const MAX_RENDERINGS_IN_PROMPT = 35;
const MAX_TEMPLATES_IN_PROMPT = 20;
const TEXT_PREVIEW_CHARS = 300;
const HEADING_PREVIEW_CHARS = 120;
const FIELD_MAPPING_HTML_MAX = 1800;

function truncate(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}…`;
}

export function chunkBlocks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function scoreTemplateRelevance(
  block: FlatContentBlock,
  template: TemplateDefinition,
): number {
  const keywords = blockTypeKeywords(inferMatchingBlockType(block));
  const haystack =
    `${template.name} ${template.fields.map((field) => field.name).join(" ")}`.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      score += 1;
    }
  }
  return score;
}

export function pickTemplatesForLlmPrompt(
  templates: TemplateDefinition[],
): TemplateDefinition[] {
  const datasourceTemplates = templates.filter(isDatasourceTemplate);

  if (datasourceTemplates.length > 0) {
    return datasourceTemplates.slice(0, MAX_TEMPLATES_IN_PROMPT);
  }

  return templates
    .filter((template) => template.fields.length > 0)
    .slice(0, MAX_TEMPLATES_IN_PROMPT);
}

export function pickRelevantTemplates(
  blocks: FlatContentBlock[],
  templates: TemplateDefinition[],
): TemplateDefinition[] {
  const scored = templates.map((template) => ({
    template,
    score: blocks.reduce(
      (total, block) => total + scoreTemplateRelevance(block, template),
      0,
    ),
  }));

  scored.sort((a, b) => b.score - a.score);

  const picked = scored
    .filter((entry) => entry.score > 0)
    .slice(0, MAX_TEMPLATES_IN_PROMPT)
    .map((entry) => entry.template);

  if (picked.length > 0) {
    return picked;
  }

  return templates.slice(0, MAX_TEMPLATES_IN_PROMPT);
}

export function compactRenderings(renderings: DiscoveryItem[]): string {
  return renderings
    .slice(0, MAX_RENDERINGS_IN_PROMPT)
    .map((item) => item.name)
    .join("; ");
}

export function compactTemplateCatalog(
  templates: TemplateDefinition[],
): string {
  return templates
    .map((template) => {
      const fields = template.fields
        .slice(0, 20)
        .map((field) => `${field.name}:${field.type}`)
        .join(",");
      return `${template.name}{${fields}}`;
    })
    .join("\n");
}

function describeBlockStructure(block: FlatContentBlock): string {
  const html = block.htmlSnippet.toLowerCase();
  const structural: string[] = [];

  if (/<blockquote\b/i.test(html)) {
    structural.push("blockquote");
  }
  if (/<figcaption\b/i.test(html)) {
    structural.push("figcaption");
  }
  if (/<figure\b/i.test(html)) {
    structural.push("figure");
  }
  if (/<iframe\b/i.test(html)) {
    structural.push("iframe");
  }
  if (/itemprop=["']author["']/i.test(html)) {
    structural.push("microdata-author");
  }
  if (/\bclass=["'][^"']*author/i.test(html)) {
    structural.push("class-author");
  }

  const articleCount = (block.htmlSnippet.match(/<article\b/gi) ?? []).length;
  const cardCount = (block.htmlSnippet.match(/\bcard\b/gi) ?? []).length;

  if (articleCount > 0) {
    structural.push(`articles:${articleCount}`);
  }
  if (cardCount > 0) {
    structural.push(`cards:${cardCount}`);
  }

  structural.push(`links:${block.links.length}`);
  structural.push(`images:${block.images.length}`);

  const signals = describeBlockSignals(block);
  if (signals) {
    structural.push(signals);
  }

  return structural.join(",");
}

export function compactBlocksForMatchPass(
  blocks: FlatContentBlock[],
): string {
  return blocks
    .map((block) => {
      const intent = inferMatchingBlockType(block);
      const crawlType = block.type;
      const heading = block.heading
        ? truncate(block.heading, HEADING_PREVIEW_CHARS)
        : "";
      const text = truncate(block.text, TEXT_PREVIEW_CHARS);
      const structure = describeBlockStructure(block);
      const intentLabel =
        intent !== crawlType ? `${crawlType}->${intent}` : intent;

      return [
        block.id,
        `crawl:${crawlType}`,
        `intent:${intentLabel}`,
        heading ? `heading:${heading}` : "",
        `text:${text}`,
        `structure:${structure}`,
        block.selector ? `selector:${truncate(block.selector, 80)}` : "",
      ]
        .filter(Boolean)
        .join("|");
    })
    .join("\n");
}

export interface FieldMappingPromptItem {
  block: FlatContentBlock;
  template: TemplateDefinition;
}

export function buildFieldMappingPrompt(
  block: FlatContentBlock,
  template: TemplateDefinition,
): string {
  const fields = template.fields
    .map((field) => `- ${field.name} (${field.type}, section: ${field.section})`)
    .join("\n");

  const htmlSnippet = truncate(block.htmlSnippet, FIELD_MAPPING_HTML_MAX);

  return `You are a Sitecore migration expert. Map content from the HTML snippet to the fields of the target template.
Use only field names listed below. Extract exact text or URLs from the HTML — do not invent content.
For image/media fields use the image src URL; include imageAlt when alt text is present in HTML.
For Rich Text / HTML fields preserve meaningful markup when short; otherwise use plain extracted text.
Set sourceRegion to a short label (e.g. heading, blockquote, author, cta, image).

TARGET TEMPLATE: ${template.name}
AVAILABLE FIELDS:
${fields}

BLOCK ID: ${block.id}
BLOCK TYPE: ${block.type}
${block.heading ? `HEADING: ${block.heading}` : ""}

HTML SNIPPET:
${htmlSnippet}

Return JSON only: {"blocks":[{"blockId":"${block.id}","mappings":[{"sitecoreField":"FieldName","sourceValue":"extracted value","sourceRegion":"region label","confidence":"high|medium|low","imageAlt":""}]}]}`;
}

export function buildBatchFieldMappingPrompt(
  items: FieldMappingPromptItem[],
): string {
  const sections = items.map(({ block, template }) => {
    const fields = template.fields
      .map((field) => `${field.name}:${field.type}`)
      .join(", ");
    const htmlSnippet = truncate(block.htmlSnippet, FIELD_MAPPING_HTML_MAX);

    return `--- BLOCK ${block.id} ---
TEMPLATE: ${template.name}
FIELDS: ${fields}
${block.heading ? `HEADING: ${block.heading}` : ""}
HTML:
${htmlSnippet}`;
  });

  return `You are a Sitecore migration expert. For each block below, map HTML content to that block's template fields.
Use only listed field names. Extract exact text or URLs — do not invent content.
For image fields use src URL and imageAlt when available.

${sections.join("\n\n")}

Return JSON only: {"blocks":[{"blockId":"","mappings":[{"sitecoreField":"","sourceValue":"","sourceRegion":"","confidence":"high|medium|low","imageAlt":""}]}]}`;
}

export function buildCombinedMatchPrompt(
  blocks: FlatContentBlock[],
  renderings: DiscoveryItem[],
  templates: TemplateDefinition[],
): string {
  const datasourceTemplates = pickTemplatesForLlmPrompt(templates);

  return `Sitecore migration: match each crawled HTML block to a rendering + datasource template.
Use only names from the lists below. Pick datasource templates (with fields), never *Parameters* templates.
Match by heading, body text, HTML structure signals, and intent — not only raw crawl type.
Each block line includes crawl type, inferred intent, structure counts (links, images, articles, blockquote, etc.), and selector.
Priority mapping: hero/banner→Hero; blockquote/featured quote/pull quote→Quote; iframe/youtube/vimeo/video-embed→Video; card/articles grid→card/feature component; image-only→media; default text→rich text component.
Semantic hints: hero/banner/jumbotron→Hero; blockquote/featured quote/testimonial/pull quote→Quote; video/youtube/embed/video-embed→Video; image-only→media component if listed; rich text/article→text component; card grid/features/testimonials→grid/card component if listed.
Return JSON only: {"matches":[{"blockId":"","matchScore":0-100,"confidence":"high|medium|low","renderingName":"","templateName":"","reason":""}]}
Rules: one match per block; use only listed names; reason max 8 words; no field mappings.
When no rendering/template fits a block (card grid, stats, rich text, compound section, etc.), set renderingName and templateName to empty strings, matchScore to 0, and explain why in reason — do not force Hero/Video/Quote.
Compound blocks with multiple articles or testimonial figures should map to individual sub-blocks when listed separately; skip parent containers.

RENDERINGS: ${compactRenderings(renderings)}
TEMPLATES:
${compactTemplateCatalog(datasourceTemplates)}
BLOCKS:
${compactBlocksForMatchPass(blocks)}`;
}

export {
  BLOCKS_PER_PASS,
  FIELDS_PER_PASS,
  FIELD_MAPPING_HTML_MAX,
  MAX_BLOCKS_PER_RUN,
};
