import {
  getDefaultModelId,
  getDefaultModels,
  isModelNotFoundError,
} from "@/lib/ai-match/default-models";
import {
  AUTO_MATCH_SCORE_THRESHOLD,
  LOW_CONFIDENCE_SCORE,
  matchBlocksToSitecore,
  summarizeComponentMapping,
} from "@/lib/ai-match/component-mapper";
import { buildHeuristicFieldMappings } from "@/lib/ai-match/heuristic-field-map";
import {
  formatLlmError,
  isDailyQuotaExhausted,
  isRateLimitError,
  requestDelayMs,
  sleep,
  withLlmRetry,
} from "@/lib/ai-match/llm-client";
import { extractJsonFromText } from "@/lib/ai-match/parse-response";
import {
  BLOCKS_PER_PASS,
  buildCombinedMatchPrompt,
  chunkBlocks,
  MAX_BLOCKS_PER_RUN,
} from "@/lib/ai-match/prompt";
import type { CrawledPage } from "@/types/crawl";
import type {
  AiMatchInput,
  AiMatchResult,
  BlockMatchResult,
  FlatContentBlock,
  MatchConfidence,
} from "@/types/ai-match";
import type { DiscoveryItem, TemplateDefinition } from "@/types/discovery";

interface RawCombinedMatch {
  blockId: string;
  matchScore: number;
  confidence?: MatchConfidence;
  renderingName: string;
  templateName: string;
  reason?: string;
  fieldMappings?: BlockMatchResult["fieldMappings"];
}

class LlmRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function callGemini(
  apiKey: string,
  modelId: string,
  prompt: string,
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  const payload = (await response.json()) as {
    error?: { message?: string; status?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  if (!response.ok) {
    const message =
      payload.error?.message ?? `Gemini request failed (${response.status}).`;
    throw new LlmRequestError(message, response.status);
  }

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

async function callClaude(
  apiKey: string,
  modelId: string,
  prompt: string,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nRespond with JSON only.`,
        },
      ],
    }),
  });

  const payload = (await response.json()) as {
    error?: { message?: string };
    content?: Array<{ type: string; text?: string }>;
  };

  if (!response.ok) {
    const message =
      payload.error?.message ?? `Claude request failed (${response.status}).`;
    throw new LlmRequestError(message, response.status);
  }

  const text = payload.content?.find((part) => part.type === "text")?.text;
  if (!text) {
    throw new Error("Claude returned an empty response.");
  }

  return text;
}

async function callLlmWithFallback(
  provider: AiMatchInput["provider"],
  apiKey: string,
  prompt: string,
): Promise<{ text: string; modelId: string }> {
  const models = getDefaultModels(provider);
  let lastError: unknown;

  for (const modelId of models) {
    try {
      const text = await callLlm(provider, apiKey, modelId, prompt);
      return { text, modelId };
    } catch (error) {
      lastError = error;
      const message =
        error instanceof Error ? error.message : "LLM request failed.";
      if (!isModelNotFoundError(message)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("No configured model is available for this provider.");
}

async function callLlm(
  provider: AiMatchInput["provider"],
  apiKey: string,
  modelId: string,
  prompt: string,
): Promise<string> {
  const invoke = () =>
    provider === "claude"
      ? callClaude(apiKey, modelId, prompt)
      : callGemini(apiKey, modelId, prompt);

  return withLlmRetry(invoke, {
    isRetryable: (error) => {
      if (!(error instanceof LlmRequestError)) {
        return false;
      }
      if (isDailyQuotaExhausted(error.message)) {
        return false;
      }
      return isRateLimitError(error.status, error.message);
    },
  });
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

function findRendering(
  renderings: DiscoveryItem[],
  name: string,
): DiscoveryItem | undefined {
  return renderings.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
}

function findTemplate(
  templates: TemplateDefinition[],
  name: string,
): TemplateDefinition | undefined {
  return templates.find(
    (template) => template.name.toLowerCase() === name.toLowerCase(),
  );
}

function normalizeLlmMatches(
  rawMatches: RawCombinedMatch[],
  blocks: FlatContentBlock[],
  renderings: DiscoveryItem[],
  templates: TemplateDefinition[],
): BlockMatchResult[] {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));

  return rawMatches.map((raw) => {
    const block = blockMap.get(raw.blockId);
    const score = Math.min(100, Math.max(0, Number(raw.matchScore) || 0));
    const confidence = raw.confidence ?? scoreToConfidence(score);
    const rendering = findRendering(renderings, raw.renderingName);
    const template = findTemplate(templates, raw.templateName);
    const fieldMappings =
      raw.fieldMappings && raw.fieldMappings.length > 0
        ? raw.fieldMappings
        : block
          ? buildHeuristicFieldMappings(block, template)
          : [];

    return {
      blockId: raw.blockId,
      pageUrl: block?.pageUrl ?? "",
      blockType: block?.type ?? "unknown",
      blockHeading: block?.heading,
      matchScore: score,
      confidence,
      renderingName: rendering?.name ?? raw.renderingName,
      renderingPath: rendering?.path,
      templateName: template?.name ?? raw.templateName,
      templatePath: template?.path,
      reasoning: raw.reason ?? "LLM suggested this rendering/template pair.",
      fieldMappings,
      needsReview: score < LOW_CONFIDENCE_SCORE || confidence === "low",
    };
  });
}

function mergeMatches(
  ruleBased: BlockMatchResult[],
  llmMatches: BlockMatchResult[],
): BlockMatchResult[] {
  const llmByBlockId = new Map(
    llmMatches.map((match) => [match.blockId, match]),
  );

  return ruleBased.map((existing) => {
    const llmMatch = llmByBlockId.get(existing.blockId);
    if (!llmMatch) {
      return existing;
    }

    if (llmMatch.matchScore > existing.matchScore) {
      return llmMatch;
    }

    return existing;
  });
}

function blocksNeedingLlm(matches: BlockMatchResult[]): BlockMatchResult[] {
  return matches.filter(
    (match) =>
      !match.renderingName ||
      match.matchScore < AUTO_MATCH_SCORE_THRESHOLD ||
      match.needsReview,
  );
}

async function matchBlocksInChunks(
  provider: AiMatchInput["provider"],
  apiKey: string,
  blocks: FlatContentBlock[],
  renderings: DiscoveryItem[],
  templates: TemplateDefinition[],
): Promise<{ matches: RawCombinedMatch[]; modelId: string }> {
  const chunks = chunkBlocks(blocks, BLOCKS_PER_PASS);
  const allMatches: RawCombinedMatch[] = [];
  const delayMs = requestDelayMs(provider);
  let modelId = getDefaultModelId(provider);

  for (let index = 0; index < chunks.length; index += 1) {
    if (index > 0) {
      await sleep(delayMs);
    }

    const chunk = chunks[index]!;
    const prompt = buildCombinedMatchPrompt(chunk, renderings, templates);
    const response = await callLlmWithFallback(provider, apiKey, prompt);
    modelId = response.modelId;
    const parsed = JSON.parse(extractJsonFromText(response.text)) as {
      matches?: RawCombinedMatch[];
    };
    allMatches.push(...(parsed.matches ?? []));
  }

  return { matches: allMatches, modelId };
}

export async function runAiMatch(input: AiMatchInput): Promise<AiMatchResult> {
  const { provider, apiKey, blocks, renderings, templates } = input;

  if (blocks.length === 0) {
    return {
      success: false,
      message: "No crawled blocks available to match.",
    };
  }

  if (renderings.length === 0 || templates.length === 0) {
    return {
      success: false,
      message: "Discovery data must include renderings and templates.",
    };
  }

  const limitedBlocks = blocks.slice(0, MAX_BLOCKS_PER_RUN);
  const skippedCount = blocks.length - limitedBlocks.length;

  const ruleBasedMatches = matchBlocksToSitecore(
    limitedBlocks,
    renderings,
    templates,
  );
  const uncertainMatches = blocksNeedingLlm(ruleBasedMatches);
  const uncertainBlockIds = new Set(uncertainMatches.map((match) => match.blockId));
  const uncertainBlocks = limitedBlocks.filter((block) =>
    uncertainBlockIds.has(block.id),
  );

  let matches = ruleBasedMatches;
  let modelId: string | undefined;
  let apiCalls = 0;

  if (uncertainBlocks.length > 0) {
    if (!apiKey.trim()) {
      const lowConfidenceCount = matches.filter((match) => match.needsReview).length;
      const skippedNote =
        skippedCount > 0
          ? ` ${skippedCount} block(s) skipped (limit: ${MAX_BLOCKS_PER_RUN} per run).`
          : "";

      return {
        success: true,
        message: `${summarizeComponentMapping(limitedBlocks, renderings, matches)} ${lowConfidenceCount} block(s) need review. Add an API key to refine uncertain matches with LLM.${skippedNote}`,
        provider,
        matches,
        lowConfidenceCount,
        reviewedCount: matches.length - lowConfidenceCount,
      };
    }

    try {
      const { matches: rawMatches, modelId: usedModel } =
        await matchBlocksInChunks(
          provider,
          apiKey,
          uncertainBlocks,
          renderings,
          templates,
        );
      modelId = usedModel;
      apiCalls = Math.ceil(uncertainBlocks.length / BLOCKS_PER_PASS);

      const llmMatches = normalizeLlmMatches(
        rawMatches,
        uncertainBlocks,
        renderings,
        templates,
      );
      matches = mergeMatches(ruleBasedMatches, llmMatches);
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : "AI matching request failed.";
      const lowConfidenceCount = ruleBasedMatches.filter(
        (match) => match.needsReview,
      ).length;

      if (ruleBasedMatches.some((match) => match.renderingName)) {
        return {
          success: true,
          message: `${summarizeComponentMapping(limitedBlocks, renderings, ruleBasedMatches)} LLM refinement failed (${formatLlmError(rawMessage, provider)}). Rule-based matches kept.`,
          provider,
          matches: ruleBasedMatches,
          lowConfidenceCount,
          reviewedCount: ruleBasedMatches.length - lowConfidenceCount,
        };
      }

      return {
        success: false,
        message: formatLlmError(rawMessage, provider),
      };
    }
  }

  const lowConfidenceCount = matches.filter((match) => match.needsReview).length;
  const skippedNote =
    skippedCount > 0
      ? ` ${skippedCount} block(s) skipped (limit: ${MAX_BLOCKS_PER_RUN} per run).`
      : "";
  const llmNote =
    apiCalls > 0
      ? ` LLM refined ${uncertainBlocks.length} uncertain block(s) in ${apiCalls} call(s).`
      : " All blocks mapped by crawl type → Sitecore component name (no LLM calls).";

  return {
    success: true,
    message: `${summarizeComponentMapping(limitedBlocks, renderings, matches)}${llmNote} ${lowConfidenceCount} need manual review.${skippedNote}`,
    provider,
    modelId,
    matches,
    lowConfidenceCount,
    reviewedCount: matches.length - lowConfidenceCount,
  };
}

export function flattenCrawlBlocks(pages: CrawledPage[]): FlatContentBlock[] {
  const flat: FlatContentBlock[] = [];

  for (const page of pages) {
    for (const block of page.blocks) {
      flat.push({
        ...block,
        pageUrl: page.url,
        pageTitle: page.title,
      });
    }
  }

  return flat;
}
