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
  sourceSelector: string;
  sourcePageUrl: string;
  renderingName: string;
  renderingPath: string;
  templateName: string;
  templatePath: string;
  fieldAssignments: FieldAssignment[];
  createdAt: Date;
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
