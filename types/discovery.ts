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
  /** Present during discovery fetch; stripped from persisted payload. */
  templateName?: string;
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
  /** Media library folder for crawled image uploads during migrate push. */
  mediaPath?: string;
  /** Optional Sitecore page template path used when creating missing target pages. */
  pageTemplatePath?: string;
  /** SXA Page Data template for the page-level Data item under new pages. */
  sxaPageDataTemplatePath?: string;
  /** Included only on failed discovery (paths not found). */
  pathValidation?: PathValidationResult[];
  renderings?: DiscoveryItem[];
  templates?: TemplateDefinition[];
}
