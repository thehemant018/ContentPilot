import { blockTypeKeywords } from "@/lib/ai-match/block-keywords";
import { isDatasourceTemplate } from "@/lib/sitecore/discovery/slim-result";
import type { FlatContentBlock } from "@/types/ai-match";
import type { DiscoveryItem, TemplateDefinition } from "@/types/discovery";

const BLOCKS_PER_PASS = 12;
const MAX_BLOCKS_PER_RUN = 24;
const MAX_RENDERINGS_IN_PROMPT = 35;
const MAX_TEMPLATES_IN_PROMPT = 20;
const TEXT_PREVIEW_CHARS = 140;

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
  const keywords = blockTypeKeywords(block.type);
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

export function compactBlocksForMatchPass(
  blocks: FlatContentBlock[],
): string {
  return blocks
    .map((block) => {
      const heading = block.heading ? ` h="${truncate(block.heading, 50)}"` : "";
      const text = truncate(block.text, TEXT_PREVIEW_CHARS);
      const links = block.links
        .slice(0, 1)
        .map((link) => `lnk:${link.text}`)
        .join("");
      const images = block.images
        .slice(0, 1)
        .map((image) => `img:${truncate(image.src, 60)}`)
        .join("");
      const extras = [links, images].filter(Boolean).join(" ");
      return `${block.id}|${block.type}${heading}|${text}${extras ? `|${extras}` : ""}`;
    })
    .join("\n");
}

export function buildCombinedMatchPrompt(
  blocks: FlatContentBlock[],
  renderings: DiscoveryItem[],
  templates: TemplateDefinition[],
): string {
  const datasourceTemplates = pickTemplatesForLlmPrompt(templates);

  return `Sitecore migration: match each crawled HTML block to a rendering + datasource template.
Use only names from the lists below. Pick datasource templates (with fields), never *Parameters* templates.
Match by heading, body text, and structure — not only crawl block type.
Semantic hints: hero/banner/jumbotron→Hero; blockquote/featured quote/testimonial/pull quote→Quote; video/youtube/embed→Video; image-only→media component if listed; rich text/article→text component; card grid/features/testimonials→grid/card component if listed.
Return JSON only: {"matches":[{"blockId":"","matchScore":0-100,"confidence":"high|medium|low","renderingName":"","templateName":"","reason":""}]}
Rules: one match per block; use only listed names; reason max 8 words; no field mappings.

RENDERINGS: ${compactRenderings(renderings)}
TEMPLATES:
${compactTemplateCatalog(datasourceTemplates)}
BLOCKS:
${compactBlocksForMatchPass(blocks)}`;
}

export { BLOCKS_PER_PASS, MAX_BLOCKS_PER_RUN };
