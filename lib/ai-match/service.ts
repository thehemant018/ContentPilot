import { refineBlockForMatching } from "@/lib/ai-match/block-intent";
import {
  getDefaultModelId,
  getDefaultModels,
  isModelNotFoundError,
} from "@/lib/ai-match/default-models";
import {
  buildNoMatchResult,
  LOW_CONFIDENCE_SCORE,
  matchBlockToSitecore,
  matchBlocksToSitecore,
  summarizeComponentMapping,
} from "@/lib/ai-match/component-mapper";
import {
  FIELD_MAPPING_RESPONSE_SCHEMA,
  mergeFieldMappingResults,
  parseLlmFieldMappingsForBlock,
  type RawLlmFieldMappingResponse,
} from "@/lib/ai-match/field-map-llm";
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
  buildBatchFieldMappingPrompt,
  buildCombinedMatchPrompt,
  chunkBlocks,
  FIELDS_PER_PASS,
  MAX_BLOCKS_PER_RUN,
  type FieldMappingPromptItem,
} from "@/lib/ai-match/prompt";
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

interface LlmCallOptions {
  maxOutputTokens?: number;
  jsonSchema?: Record<string, unknown>;
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
  options?: LlmCallOptions,
): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: options?.maxOutputTokens ?? 1024,
    responseMimeType: "application/json",
  };

  if (options?.jsonSchema) {
    generationConfig.responseSchema = options.jsonSchema;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
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

async function callGroq(
  apiKey: string,
  modelId: string,
  prompt: string,
  options?: LlmCallOptions,
): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: options?.maxOutputTokens ?? 1024,
      temperature: 0.2,
      response_format: { type: "json_object" },
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
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    const message =
      payload.error?.message ?? `Groq request failed (${response.status}).`;
    throw new LlmRequestError(message, response.status);
  }

  const text = payload.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Groq returned an empty response.");
  }

  return text;
}

async function callClaude(
  apiKey: string,
  modelId: string,
  prompt: string,
  options?: LlmCallOptions,
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
      max_tokens: options?.maxOutputTokens ?? 1024,
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
  options?: LlmCallOptions,
): Promise<{ text: string; modelId: string }> {
  const models = getDefaultModels(provider);
  let lastError: unknown;

  for (const modelId of models) {
    try {
      const text = await callLlm(provider, apiKey, modelId, prompt, options);
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
  options?: LlmCallOptions,
): Promise<string> {
  const invoke = () => {
    if (provider === "claude") {
      return callClaude(apiKey, modelId, prompt, options);
    }
    if (provider === "groq") {
      return callGroq(apiKey, modelId, prompt, options);
    }
    return callGemini(apiKey, modelId, prompt, options);
  };

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

function isSkipMatchName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    !normalized ||
    normalized === "none" ||
    normalized === "n/a" ||
    normalized === "skip" ||
    normalized === "unmatched"
  );
}

function normalizeLlmMatches(
  rawMatches: RawCombinedMatch[],
  blocks: FlatContentBlock[],
  renderings: DiscoveryItem[],
  templates: TemplateDefinition[],
  useHeuristicFields: boolean,
): BlockMatchResult[] {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));

  return rawMatches.map((raw) => {
    const block = blockMap.get(raw.blockId);
    if (!block) {
      return buildNoMatchResult(
        {
          id: raw.blockId,
          type: "unknown",
          tagName: "div",
          selector: "",
          text: "",
          htmlSnippet: "",
          links: [],
          images: [],
          order: 0,
          pageUrl: "",
          pageTitle: "",
        },
        renderings,
        "Block not found in crawl data.",
      );
    }

    const refinedBlock = refineBlockForMatching(block);

    if (
      isSkipMatchName(raw.renderingName) ||
      isSkipMatchName(raw.templateName)
    ) {
      return buildNoMatchResult(
        refinedBlock,
        renderings,
        raw.reason ?? "LLM found no suitable Sitecore component.",
      );
    }

    const score = Math.min(100, Math.max(0, Number(raw.matchScore) || 0));
    const confidence = raw.confidence ?? scoreToConfidence(score);
    const rendering = findRendering(renderings, raw.renderingName);
    const template = findTemplate(templates, raw.templateName);

    if (!rendering || !template || score < LOW_CONFIDENCE_SCORE) {
      return buildNoMatchResult(
        refinedBlock,
        renderings,
        raw.reason ??
          "LLM match could not be resolved to a discovery rendering/template.",
      );
    }

    const fieldMappings =
      raw.fieldMappings && raw.fieldMappings.length > 0
        ? raw.fieldMappings
        : useHeuristicFields
          ? buildHeuristicFieldMappings(block, template)
          : [];

    return {
      blockId: raw.blockId,
      pageUrl: block.pageUrl,
      blockType: refinedBlock.type,
      blockHeading: block.heading,
      parentBlockId: block.parentBlockId,
      matchScore: score,
      confidence,
      renderingName: rendering.name,
      renderingPath: rendering.path,
      templateName: template.name,
      templatePath: template.path,
      reasoning: raw.reason ?? "LLM suggested this rendering/template pair.",
      fieldMappings,
      needsReview: score < LOW_CONFIDENCE_SCORE || confidence === "low",
      unmatched: false,
    };
  });
}

function isResolvableLlmMatch(match: BlockMatchResult | undefined): boolean {
  return Boolean(
    match &&
      !match.unmatched &&
      match.renderingPath &&
      match.templatePath,
  );
}

function buildLlmOnlyMatches(
  blocks: FlatContentBlock[],
  llmMatches: BlockMatchResult[],
  renderings: DiscoveryItem[],
  templates: TemplateDefinition[],
): BlockMatchResult[] {
  const llmByBlockId = new Map(llmMatches.map((match) => [match.blockId, match]));

  return blocks.map((block) => {
    const refinedBlock = refineBlockForMatching(block);
    const llmMatch = llmByBlockId.get(block.id);

    const withContext = (match: BlockMatchResult): BlockMatchResult => ({
      ...match,
      blockType: refinedBlock.type,
      parentBlockId: block.parentBlockId,
    });

    if (
      llmMatch &&
      !llmMatch.unmatched &&
      isResolvableLlmMatch(llmMatch) &&
      llmMatch.matchScore >= LOW_CONFIDENCE_SCORE
    ) {
      return withContext(llmMatch);
    }

    if (llmMatch?.unmatched) {
      return withContext(llmMatch);
    }

    const fallback = matchBlockToSitecore(refinedBlock, renderings, templates);
    if (llmMatch && !llmMatch.unmatched) {
      return withContext({
        ...fallback,
        reasoning: `No confident LLM match; ${fallback.reasoning}`,
      });
    }

    return withContext(fallback);
  });
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

function buildFieldMappingItems(
  matches: BlockMatchResult[],
  blocks: FlatContentBlock[],
  templates: TemplateDefinition[],
): FieldMappingPromptItem[] {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const items: FieldMappingPromptItem[] = [];

  for (const match of matches) {
    if (match.unmatched || !isResolvableLlmMatch(match)) {
      continue;
    }

    const block = blockMap.get(match.blockId);
    const template = findTemplate(templates, match.templateName);
    if (!block || !template || template.fields.length === 0) {
      continue;
    }

    items.push({ block, template });
  }

  return items;
}

async function matchFieldsInChunks(
  provider: AiMatchInput["provider"],
  apiKey: string,
  matches: BlockMatchResult[],
  blocks: FlatContentBlock[],
  templates: TemplateDefinition[],
): Promise<{ matches: BlockMatchResult[]; modelId: string; apiCalls: number }> {
  const items = buildFieldMappingItems(matches, blocks, templates);
  if (items.length === 0) {
    return { matches, modelId: getDefaultModelId(provider), apiCalls: 0 };
  }

  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const templateByBlockId = new Map(
    items.map((item) => [item.block.id, item.template]),
  );
  const llmByBlockId = new Map<string, BlockMatchResult["fieldMappings"]>();
  const chunks = chunkBlocks(items, FIELDS_PER_PASS);
  const delayMs = requestDelayMs(provider);
  let modelId = getDefaultModelId(provider);

  for (let index = 0; index < chunks.length; index += 1) {
    if (index > 0) {
      await sleep(delayMs);
    }

    const chunk = chunks[index]!;
    const prompt = buildBatchFieldMappingPrompt(chunk);
    const geminiSchema =
      provider === "gemini"
        ? { jsonSchema: FIELD_MAPPING_RESPONSE_SCHEMA as Record<string, unknown> }
        : undefined;

    try {
      const response = await callLlmWithFallback(provider, apiKey, prompt, {
        maxOutputTokens: 2048,
        ...geminiSchema,
      });
      modelId = response.modelId;

      const parsed = JSON.parse(
        extractJsonFromText(response.text),
      ) as RawLlmFieldMappingResponse;

      for (const blockResult of parsed.blocks ?? []) {
        const block = blockMap.get(blockResult.blockId);
        const template = templateByBlockId.get(blockResult.blockId);
        if (!block || !template) {
          continue;
        }

        const mappings = parseLlmFieldMappingsForBlock(
          block,
          template,
          blockResult.mappings,
        );
        if (mappings.length > 0) {
          llmByBlockId.set(blockResult.blockId, mappings);
        }
      }
    } catch (error) {
      console.warn(
        "LLM field mapping pass failed for chunk; using heuristic fallback.",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const updatedMatches = matches.map((match) => ({ ...match }));
  const blockIdsToUpdate = new Set(items.map((item) => item.block.id));
  mergeFieldMappingResults(
    updatedMatches,
    blockMap,
    templateByBlockId,
    llmByBlockId,
    blockIdsToUpdate,
  );

  return { matches: updatedMatches, modelId, apiCalls: chunks.length };
}

export async function runAiMatch(input: AiMatchInput): Promise<AiMatchResult> {
  const {
    provider,
    apiKey,
    useRuleBasedMatching,
    blocks,
    renderings,
    templates,
  } = input;

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

  const limitedBlocks = blocks
    .slice(0, MAX_BLOCKS_PER_RUN)
    .map(refineBlockForMatching);
  const skippedCount = blocks.length - limitedBlocks.length;
  const skippedNote =
    skippedCount > 0
      ? ` ${skippedCount} block(s) skipped (limit: ${MAX_BLOCKS_PER_RUN} per run).`
      : "";

  if (useRuleBasedMatching) {
    const matches = matchBlocksToSitecore(
      limitedBlocks,
      renderings,
      templates,
    );
    const lowConfidenceCount = matches.filter(
      (match) => !match.unmatched && match.needsReview,
    ).length;

    return {
      success: true,
      message: `${summarizeComponentMapping(limitedBlocks, renderings, matches)} Rule-based matching. ${lowConfidenceCount} need manual review.${skippedNote}`,
      provider,
      matchStrategy: "rule-based",
      matches,
      lowConfidenceCount,
      reviewedCount: matches.length - lowConfidenceCount,
    };
  }

  if (!apiKey.trim()) {
    return {
      success: false,
      message:
        "No LLM API key configured on the server. Set the provider key in .env.local or enable rule-based matching.",
    };
  }

  let modelId: string | undefined;
  const matchApiCalls = Math.ceil(limitedBlocks.length / BLOCKS_PER_PASS);

  try {
    const { matches: rawMatches, modelId: usedModel } =
      await matchBlocksInChunks(
        provider,
        apiKey,
        limitedBlocks,
        renderings,
        templates,
      );
    modelId = usedModel;

    const llmMatches = normalizeLlmMatches(
      rawMatches,
      limitedBlocks,
      renderings,
      templates,
      false,
    );

    const {
      matches: matchesWithFields,
      modelId: fieldModelId,
      apiCalls: fieldApiCalls,
    } = await matchFieldsInChunks(
      provider,
      apiKey,
      llmMatches,
      limitedBlocks,
      templates,
    );
    modelId = fieldModelId;

    const matches = buildLlmOnlyMatches(
      limitedBlocks,
      matchesWithFields,
      renderings,
      templates,
    );
    const lowConfidenceCount = matches.filter(
      (match) => !match.unmatched && match.needsReview,
    ).length;
    const resolvedCount = matches.filter(
      (match) => !match.unmatched && isResolvableLlmMatch(match),
    ).length;
    const totalApiCalls = matchApiCalls + fieldApiCalls;

    return {
      success: true,
      message: `${summarizeComponentMapping(limitedBlocks, renderings, matches)} LLM matched ${resolvedCount}/${matches.length} block(s) in ${totalApiCalls} call(s) (${matchApiCalls} component + ${fieldApiCalls} field). ${lowConfidenceCount} need manual review.${skippedNote}`,
      provider,
      modelId,
      matchStrategy: "llm",
      matches,
      lowConfidenceCount,
      reviewedCount: matches.length - lowConfidenceCount,
    };
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "AI matching request failed.";

    return {
      success: false,
      message: `LLM matching failed: ${formatLlmError(rawMessage, provider)}. Enable rule-based matching to match without an API key.`,
      provider,
    };
  }
}
