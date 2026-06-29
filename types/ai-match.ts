import type { ContentBlock } from "@/types/crawl";
import type { DiscoveryItem, TemplateDefinition } from "@/types/discovery";

export type LlmProvider = "gemini" | "claude" | "groq";

export interface LlmConfig {
  provider: LlmProvider;
  /** When true, use keyword/name matching only. When false, LLM is required. */
  useRuleBasedMatching?: boolean;
}

/** Section header extracted from a multi-item crawl block (maps via discovery catalog, not a fixed component name). */
export type BlockMatchRole = "section-container";

export interface FlatContentBlock extends ContentBlock {
  pageUrl: string;
  pageTitle: string;
  /** When set, steers matching toward a list/container component vs leaf items. */
  matchRole?: BlockMatchRole;
}

export interface FieldMapping {
  sourceRegion: string;
  sourcePreview: string;
  sitecoreField: string;
  fieldType?: string;
  section?: string;
  /** Crawled img alt text when the mapped value is an image URL. */
  imageAlt?: string;
}

export type MatchConfidence = "high" | "medium" | "low";

export type MatchStrategy = "llm" | "rule-based";

export interface BlockMatchResult {
  blockId: string;
  pageUrl: string;
  blockType: string;
  blockHeading?: string;
  parentBlockId?: string;
  matchScore: number;
  confidence: MatchConfidence;
  renderingName: string;
  renderingPath?: string;
  templateName: string;
  templatePath?: string;
  reasoning: string;
  fieldMappings: FieldMapping[];
  needsReview: boolean;
  /** True when no Sitecore component in discovery fits this block. */
  unmatched?: boolean;
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
