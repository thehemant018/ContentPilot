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

export interface MigrationPagePresentationExport {
  targetPagePath: string;
  language: string;
  renderings: MigrationPresentationExport[];
}

export interface MigrationExportManifest {
  batchId: string;
  exportedAt: string;
  componentCount: number;
  pageCount: number;
  components: string[];
  pages: string[];
}

export interface MigrationExportResult {
  success: boolean;
  message: string;
  batchId?: string;
  outputDir?: string;
  manifest?: MigrationExportManifest;
  skipped?: Array<{ queueItemId: string; reason: string }>;
}

export interface MigrationPushComponentResult {
  queueItemId: string;
  datasourcePath: string;
  targetPagePath: string;
  datasourceCreated: boolean;
  datasourceUpdated: boolean;
  presentationAssigned: boolean;
  warnings: string[];
  error?: string;
}

export interface MigrationPushResult {
  success: boolean;
  message: string;
  batchId?: string;
  results?: MigrationPushComponentResult[];
  pushedCount?: number;
  failedCount?: number;
}
