import type { ContentBlock } from "@/types/crawl";
import type { DiscoveryItem, TemplateDefinition } from "@/types/discovery";

export type LlmProvider = "gemini" | "claude";

export interface LlmConfig {
  provider: LlmProvider;
  geminiApiKey?: string;
  claudeApiKey?: string;
  /** When true, use keyword/name matching only. When false, LLM is required. */
  useRuleBasedMatching?: boolean;
}

export interface FlatContentBlock extends ContentBlock {
  pageUrl: string;
  pageTitle: string;
}

export interface FieldMapping {
  sourceRegion: string;
  sourcePreview: string;
  sitecoreField: string;
  fieldType?: string;
  section?: string;
}

export type MatchConfidence = "high" | "medium" | "low";

export type MatchStrategy = "llm" | "rule-based";

export interface BlockMatchResult {
  blockId: string;
  pageUrl: string;
  blockType: string;
  blockHeading?: string;
  matchScore: number;
  confidence: MatchConfidence;
  renderingName: string;
  renderingPath?: string;
  templateName: string;
  templatePath?: string;
  reasoning: string;
  fieldMappings: FieldMapping[];
  needsReview: boolean;
}

export interface AiMatchInput {
  provider: LlmProvider;
  apiKey: string;
  useRuleBasedMatching: boolean;
  blocks: FlatContentBlock[];
  renderings: DiscoveryItem[];
  templates: TemplateDefinition[];
}

export interface AiMatchResult {
  success: boolean;
  message: string;
  provider?: LlmProvider;
  modelId?: string;
  matchStrategy?: MatchStrategy;
  matches?: BlockMatchResult[];
  lowConfidenceCount?: number;
  reviewedCount?: number;
}
