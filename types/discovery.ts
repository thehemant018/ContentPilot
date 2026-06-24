export interface SitecoreSite {
  name: string;
  rootPath: string;
  domain?: string;
  startPath?: string;
  rootItemId?: string;
}

export interface PathValidationResult {
  path: string;
  label: string;
  exists: boolean;
  itemId?: string;
  name?: string;
  templateName?: string;
}

export interface DiscoveryItem {
  itemId: string;
  name: string;
  path: string;
  templateName: string;
  templateId?: string;
}

export interface TemplateFieldDefinition {
  name: string;
  type: string;
  section: string;
}

export interface TemplateDefinition {
  itemId: string;
  name: string;
  path: string;
  fields: TemplateFieldDefinition[];
}

export interface DiscoveryPathsInput {
  siteName: string;
  renderingsPath: string;
  mediaPath: string;
  templatesPath: string;
}

export interface DiscoveryResult {
  success: boolean;
  message: string;
  /** Media library folder path from Discovery (used when uploading crawled images). */
  mediaPath?: string;
  pathValidation?: PathValidationResult[];
  allPathsValid?: boolean;
  renderings?: DiscoveryItem[];
  media?: DiscoveryItem[];
  templates?: TemplateDefinition[];
}
