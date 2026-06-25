import type { MatchConfidence } from "@/types/ai-match";

export interface EditableFieldValue {
  id: string;
  sourceRegion: string;
  sitecoreField: string;
  fieldType?: string;
  section?: string;
  value: string;
  /** Alt text for image URL values, used during media upload. */
  imageAlt?: string;
}

export interface MigrationQueueItem {
  id: string;
  addedAt: string;
  blockId: string;
  sourcePageUrl: string;
  blockType: string;
  blockHeading?: string;
  renderingName: string;
  renderingPath?: string;
  templateName: string;
  templatePath?: string;
  matchScore: number;
  confidence: MatchConfidence;
  reasoning: string;
  /** Sitecore item path where this component should be placed during migration. */
  targetPagePath: string;
  /** Presentation placeholder key (e.g. headless-main for SXA headless). */
  placeholder?: string;
  /** Override auto-generated datasource item path. */
  datasourcePath?: string;
  /** Language for presentation/datasource (default en). */
  language?: string;
  fields: EditableFieldValue[];
}
