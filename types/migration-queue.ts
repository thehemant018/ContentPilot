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
  /** Base presentation placeholder key (e.g. headless-main). Resolved to dynamic keys at push. */
  placeholder?: string;
  /** Parent queue item for nested presentation (e.g. Card Item under Card List). */
  parentQueueItemId?: string;
  /** Crawl parent block id — used to link hierarchy before parent is queued. */
  parentBlockId?: string;
  /** Static child placeholder key from Placeholder Settings (e.g. card-list-items). */
  childPlaceholderKey?: string;
  /** Depth in presentation tree (0 = page root). */
  presentationDepth?: number;
  /** Order among siblings under the same parent placeholder. */
  presentationSiblingIndex?: number;
  /** Dynamic placeholder id suffix from rendering parameters (default 1). */
  dynamicPlaceholderId?: number;
  /** Override auto-generated datasource item path. */
  datasourcePath?: string;
  /** Language for presentation/datasource (default en). */
  language?: string;
  fields: EditableFieldValue[];
}
