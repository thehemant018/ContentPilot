export interface SelectedElement {
  selector: string;
  tagName: string;
  extracted: ExtractedContent;
  boundingRect: DOMRect;
}

export interface ExtractedContent {
  text: string;
  html: string;
  src: string;
  href: string;
  alt: string;
  tagName: string;
  isImage: boolean;
  isLink: boolean;
  isHeading: boolean;
  isRichText: boolean;
  linkTarget?: string;
}

export interface FieldAssignment {
  sitecoreField: string;
  fieldType: string;
  sourceSelector: string;
  value: string;
  valuePreview: string;
  assignedManually: boolean;
}

export interface MappingEntry {
  id: string;
  /** Stable key for bulk apply deduplication across pages. */
  templateKey?: string;
  sourceSelector: string;
  sourcePageUrl: string;
  renderingName: string;
  renderingPath: string;
  templateName: string;
  templatePath: string;
  fieldAssignments: FieldAssignment[];
  createdAt: Date;
}

/** Blueprint for applying the same component/field mapping to similar pages. */
export interface PageMappingTemplate {
  templatePageUrl: string;
  components: ComponentMappingTemplate[];
}

export interface ComponentMappingTemplate {
  templateKey: string;
  sourceSelector: string;
  renderingName: string;
  renderingPath: string;
  templateName: string;
  templatePath: string;
  fields: Array<{
    sitecoreField: string;
    fieldType: string;
    sourceSelector: string;
  }>;
}

export type BulkApplyStatus = "ok" | "partial" | "failed";

export interface BulkApplyPageResult {
  url: string;
  status: BulkApplyStatus;
  mappings: MappingEntry[];
  targetPagePath: string;
  /** Sitecore page item name derived from the source URL slug. */
  pageName: string;
  missingFields: string[];
  pageTitle: string;
  error?: string;
}

export interface BulkApplyResult {
  results: BulkApplyPageResult[];
  totalUrls: number;
  successCount: number;
  partialCount: number;
  failedCount: number;
}

export interface VisualMapperSession {
  siteId: string;
  sourceUrl: string;
  mappings: MappingEntry[];
  status: "idle" | "loading" | "ready" | "migrating" | "done" | "error";
}

export interface DraftRenderingInfo {
  renderingName: string;
  renderingPath: string;
  templateName: string;
  templatePath: string;
}

/** Step 1: pick iframe block + Sitecore rendering. Step 2: map fields inside that pair. */
export type ComponentMappingPhase = "select-component" | "map-fields";
