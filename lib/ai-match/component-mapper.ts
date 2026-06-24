import { buildHeuristicFieldMappings } from "@/lib/ai-match/heuristic-field-map";
import {
  blockTypeKeywords,
  scoreNameAgainstKeywords,
} from "@/lib/ai-match/block-keywords";
import type {
  BlockMatchResult,
  FlatContentBlock,
  MatchConfidence,
} from "@/types/ai-match";
import type { SemanticBlockType } from "@/types/crawl";
import type { DiscoveryItem, TemplateDefinition } from "@/types/discovery";

export const AUTO_MATCH_SCORE_THRESHOLD = 70;
export const LOW_CONFIDENCE_SCORE = 60;

interface ScoredItem<T> {
  item: T;
  score: number;
}

function scoreToConfidence(score: number): MatchConfidence {
  if (score >= 80) {
    return "high";
  }
  if (score >= 60) {
    return "medium";
  }
  return "low";
}

function scoreRenderingForBlock(
  block: FlatContentBlock,
  rendering: DiscoveryItem,
): number {
  const keywords = blockTypeKeywords(block.type);
  let score = scoreNameAgainstKeywords(rendering.name, keywords);

  if (block.heading) {
    score += scoreNameAgainstKeywords(block.heading, keywords) * 0.25;
  }

  return score;
}

function scoreTemplateForBlock(
  block: FlatContentBlock,
  template: TemplateDefinition,
  rendering?: DiscoveryItem,
): number {
  const keywords = blockTypeKeywords(block.type);
  let score = scoreNameAgainstKeywords(template.name, keywords);

  const fieldNames = template.fields.map((field) => field.name).join(" ");
  score += scoreNameAgainstKeywords(fieldNames, keywords) * 0.35;

  if (rendering) {
    score += scoreNameAgainstKeywords(template.name, [rendering.name]) * 0.5;
  }

  return score;
}

function pickBest<T>(entries: ScoredItem<T>[]): ScoredItem<T> | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  return entries.reduce((best, current) =>
    current.score > best.score ? current : best,
  );
}

function pickRendering(
  block: FlatContentBlock,
  renderings: DiscoveryItem[],
): ScoredItem<DiscoveryItem> | undefined {
  const scored = renderings.map((rendering) => ({
    item: rendering,
    score: scoreRenderingForBlock(block, rendering),
  }));

  return pickBest(scored.filter((entry) => entry.score > 0));
}

function pickTemplate(
  block: FlatContentBlock,
  templates: TemplateDefinition[],
  rendering?: DiscoveryItem,
): ScoredItem<TemplateDefinition> | undefined {
  const scored = templates.map((template) => ({
    item: template,
    score: scoreTemplateForBlock(block, template, rendering),
  }));

  return pickBest(scored.filter((entry) => entry.score > 0));
}

function buildReason(
  block: FlatContentBlock,
  rendering: DiscoveryItem,
  template: TemplateDefinition,
  score: number,
): string {
  const crawlLabel = block.type === "rich-text" ? "rich text" : block.type;
  return `Crawl ${crawlLabel} block matched to Sitecore ${rendering.name} / ${template.name} (${score}% name match).`;
}

export function matchBlockToSitecore(
  block: FlatContentBlock,
  renderings: DiscoveryItem[],
  templates: TemplateDefinition[],
): BlockMatchResult {
  const renderingMatch = pickRendering(block, renderings);
  const rendering = renderingMatch?.item;
  const renderingScore = renderingMatch?.score ?? 0;

  const templateMatch = pickTemplate(block, templates, rendering);
  const template = templateMatch?.item;
  const templateScore = templateMatch?.score ?? 0;

  const matchScore = Math.min(
    100,
    Math.round(renderingScore * 0.65 + templateScore * 0.35),
  );
  const confidence = scoreToConfidence(matchScore);

  if (!rendering || !template || matchScore < LOW_CONFIDENCE_SCORE) {
    return {
      blockId: block.id,
      pageUrl: block.pageUrl,
      blockType: block.type,
      blockHeading: block.heading,
      matchScore,
      confidence,
      renderingName: rendering?.name ?? "",
      renderingPath: rendering?.path,
      templateName: template?.name ?? "",
      templatePath: template?.path,
      reasoning: rendering
        ? `Low-confidence match for crawl ${block.type} block. Review rendering/template choice.`
        : `No Sitecore component found for crawl type "${block.type}". Available renderings did not match by name.`,
      fieldMappings: template
        ? buildHeuristicFieldMappings(block, template)
        : [],
      needsReview: true,
    };
  }

  return {
    blockId: block.id,
    pageUrl: block.pageUrl,
    blockType: block.type,
    blockHeading: block.heading,
    matchScore,
    confidence,
    renderingName: rendering.name,
    renderingPath: rendering.path,
    templateName: template.name,
    templatePath: template.path,
    reasoning: buildReason(block, rendering, template, matchScore),
    fieldMappings: buildHeuristicFieldMappings(block, template),
    needsReview:
      matchScore < AUTO_MATCH_SCORE_THRESHOLD || confidence === "low",
  };
}

export function matchBlocksToSitecore(
  blocks: FlatContentBlock[],
  renderings: DiscoveryItem[],
  templates: TemplateDefinition[],
): BlockMatchResult[] {
  return blocks.map((block) =>
    matchBlockToSitecore(block, renderings, templates),
  );
}

export function countBlocksByType(
  blocks: FlatContentBlock[],
): Partial<Record<SemanticBlockType, number>> {
  const counts: Partial<Record<SemanticBlockType, number>> = {};

  for (const block of blocks) {
    counts[block.type] = (counts[block.type] ?? 0) + 1;
  }

  return counts;
}

export function summarizeComponentMapping(
  blocks: FlatContentBlock[],
  renderings: DiscoveryItem[],
  matches: BlockMatchResult[],
): string {
  const crawlCounts = countBlocksByType(blocks);
  const crawlSummary = Object.entries(crawlCounts)
    .map(([type, count]) => `${type}×${count}`)
    .join(", ");

  const sitecoreNames = renderings
    .slice(0, 12)
    .map((item) => item.name)
    .join(", ");
  const sitecoreSuffix =
    renderings.length > 12 ? ` (+${renderings.length - 12} more)` : "";

  const autoMatched = matches.filter(
    (match) => match.matchScore >= AUTO_MATCH_SCORE_THRESHOLD,
  ).length;

  return `Crawl blocks: ${crawlSummary || "none"}. Sitecore renderings: ${sitecoreNames}${sitecoreSuffix}. ${autoMatched}/${matches.length} mapped by component type.`;
}
