import type { MigrationQueueItem } from "@/types/migration-queue";

export interface MigrationDatasourceExport {
  name: string;
  path: string;
  templateName: string;
  templatePath?: string;
  fields: Record<string, string>;
  fieldMeta: Array<{
    name: string;
    type?: string;
    section?: string;
    sourceRegion: string;
    imageAlt?: string;
  }>;
}

export interface MigrationPresentationExport {
  itemPath: string;
  renderingName: string;
  renderingPath?: string;
  placeHolder: string;
  dataSource: string;
  finalLayout: boolean;
  language: string;
  index: number;
}

export interface MigrationComponentExport {
  queueItemId: string;
  blockId?: string;
  exportedAt: string;
  blockType: string;
  blockHeading?: string;
  sourcePageUrl: string;
  targetPagePath: string;
  matchScore: number;
  confidence: MigrationQueueItem["confidence"];
  datasource: MigrationDatasourceExport;
  presentation: MigrationPresentationExport;
}

export interface MigrationPushComponentResult {
  queueItemId: string;
  sourcePageUrl?: string;
  datasourcePath: string;
  targetPagePath: string;
  datasourceCreated: boolean;
  datasourceUpdated: boolean;
  presentationAssigned: boolean;
  mediaUploaded?: number;
  mediaReused?: number;
  warnings: string[];
  error?: string;
}

export interface MigrationPushResult {
  success: boolean;
  message: string;
  results?: MigrationPushComponentResult[];
  pushedCount?: number;
  failedCount?: number;
}
