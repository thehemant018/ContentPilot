import { buildHeuristicFieldMappings } from "@/lib/ai-match/heuristic-field-map";
import {
  isLikelyUnmatchableBlock,
  noMatchReason,
} from "@/lib/ai-match/catalog-fit";
import {
  scoreRenderingCatalogShape,
  scoreTemplateCatalogShape,
} from "@/lib/ai-match/catalog-shape";
import {
  matchKeywordsForBlock,
  refineBlockForMatching,
} from "@/lib/ai-match/block-intent";
import {
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
  const keywords = matchKeywordsForBlock(block);
  let score = scoreNameAgainstKeywords(rendering.name, keywords);

  if (block.heading) {
    score += scoreNameAgainstKeywords(block.heading, keywords) * 0.35;
  }

  if (block.selector) {
    score += scoreNameAgainstKeywords(block.selector, keywords) * 0.2;
  }

  score += scoreRenderingCatalogShape(block, rendering);

  return score;
}

function scoreTemplateForBlock(
  block: FlatContentBlock,
  template: TemplateDefinition,
  rendering?: DiscoveryItem,
): number {
  const keywords = matchKeywordsForBlock(block);
  let score = scoreNameAgainstKeywords(template.name, keywords);

  const fieldNames = template.fields.map((field) => field.name).join(" ");
  score += scoreNameAgainstKeywords(fieldNames, keywords) * 0.35;

  if (rendering) {
    score += scoreNameAgainstKeywords(template.name, [rendering.name]) * 0.5;
  }

  score += scoreTemplateCatalogShape(block, template);

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
  if (block.matchRole === "section-container") {
    return `Multi-item section header matched to ${rendering.name} / ${template.name} from discovery catalog (${score}% fit).`;
  }

  if (block.parentBlockId) {
    return `Child block matched to ${rendering.name} / ${template.name} from discovery catalog (${score}% fit).`;
  }

  const crawlLabel = block.type === "rich-text" ? "rich text" : block.type;
  return `Crawl ${crawlLabel} block matched to Sitecore ${rendering.name} / ${template.name} (${score}% name match).`;
}

export function buildNoMatchResult(
  block: FlatContentBlock,
  renderings: DiscoveryItem[],
  reason?: string,
): BlockMatchResult {
  const refinedBlock = refineBlockForMatching(block);

  return {
    blockId: block.id,
    pageUrl: block.pageUrl,
    blockType: refinedBlock.type,
    blockHeading: block.heading,
    parentBlockId: block.parentBlockId,
    matchScore: 0,
    confidence: "low",
    renderingName: "",
    templateName: "",
    reasoning: reason ?? noMatchReason(refinedBlock, renderings),
    fieldMappings: [],
    needsReview: false,
    unmatched: true,
  };
}

export function matchBlockToSitecore(
  block: FlatContentBlock,
  renderings: DiscoveryItem[],
  templates: TemplateDefinition[],
): BlockMatchResult {
  const refinedBlock = refineBlockForMatching(block);

  if (isLikelyUnmatchableBlock(refinedBlock, renderings)) {
    return buildNoMatchResult(refinedBlock, renderings);
  }

  const renderingMatch = pickRendering(refinedBlock, renderings);
  const rendering = renderingMatch?.item;
  const renderingScore = renderingMatch?.score ?? 0;

  const templateMatch = pickTemplate(refinedBlock, templates, rendering);
  const template = templateMatch?.item;
  const templateScore = templateMatch?.score ?? 0;

  const matchScore = Math.min(
    100,
    Math.round(renderingScore * 0.65 + templateScore * 0.35),
  );
  const confidence = scoreToConfidence(matchScore);

  if (!rendering || !template || matchScore < LOW_CONFIDENCE_SCORE) {
    return buildNoMatchResult(
      refinedBlock,
      renderings,
      rendering
        ? `Low-confidence match for ${refinedBlock.type} block — no reliable Sitecore component.`
        : noMatchReason(refinedBlock, renderings),
    );
  }

  return {
    blockId: block.id,
    pageUrl: block.pageUrl,
    blockType: refinedBlock.type,
    blockHeading: block.heading,
    parentBlockId: block.parentBlockId,
    matchScore,
    confidence,
    renderingName: rendering.name,
    renderingPath: rendering.path,
    templateName: template.name,
    templatePath: template.path,
    reasoning: buildReason(refinedBlock, rendering, template, matchScore),
    fieldMappings: buildHeuristicFieldMappings(block, template),
    needsReview:
      matchScore < AUTO_MATCH_SCORE_THRESHOLD || confidence === "low",
    unmatched: false,
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

  const matched = matches.filter((match) => !match.unmatched).length;
  const skipped = matches.filter((match) => match.unmatched).length;

  return `Crawl blocks: ${crawlSummary || "none"}. Sitecore renderings: ${sitecoreNames}${sitecoreSuffix}. ${matched}/${matches.length} matched${skipped > 0 ? `, ${skipped} skipped (no component)` : ""}.`;
}
