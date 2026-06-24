import type { ContentBlock } from "@/types/crawl";
import type { DiscoveryItem, TemplateDefinition } from "@/types/discovery";

export type LlmProvider = "gemini" | "claude";

export interface LlmConfig {
  provider: LlmProvider;
  geminiApiKey?: string;
  claudeApiKey?: string;
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
  blocks: FlatContentBlock[];
  renderings: DiscoveryItem[];
  templates: TemplateDefinition[];
}

export interface AiMatchResult {
  success: boolean;
  message: string;
  provider?: LlmProvider;
  modelId?: string;
  matches?: BlockMatchResult[];
  lowConfidenceCount?: number;
  reviewedCount?: number;
}
