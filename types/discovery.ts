import type { SitecoreLanguage } from "@/types/language";

export type { SitecoreLanguage };

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

export interface PlaceholderDefinition {
  itemId: string;
  name: string;
  path: string;
  /** Value of the Placeholder Key field — used in layout XML s:ph. */
  key: string;
}

export type NestedPlaceholderFormat = "path-suffix" | "guid-suffix";

export interface RenderingPlaceholderProfile {
  renderingPath: string;
  renderingId: string;
  /** Sitecore rendering item name (e.g. Card List → CardList segment). */
  renderingName: string;
  /** Placeholder keys where this rendering may be placed. */
  allowedParentPlaceholderKeys: string[];
  /** Placeholder keys this rendering exposes for child components. */
  exposedChildPlaceholderKeys: string[];
  /** Default DynamicPlaceholderId from rendering parameters template. */
  defaultDynamicPlaceholderId?: number;
  /** True when rendering parameters template defines DynamicPlaceholderId. */
  hasDynamicPlaceholders?: boolean;
  /** SXA Other properties: IsRenderingsWithDynamicPlaceholders=true on rendering. */
  usesSxaDynamicPlaceholders?: boolean;
  /** Parameter template inherits IDynamicPlaceholder base template. */
  inheritsIDynamicPlaceholder?: boolean;
  /** How nested child placeholder keys are composed at runtime. */
  nestedPlaceholderFormat?: NestedPlaceholderFormat;
}

export interface DiscoveryPathsInput {
  siteName: string;
  siteRootPath?: string;
  renderingsPath: string;
  placeholdersPath: string;
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
  placeholdersPath?: string;
  renderings?: DiscoveryItem[];
  placeholders?: PlaceholderDefinition[];
  renderingProfiles?: RenderingPlaceholderProfile[];
  templates?: TemplateDefinition[];
  /** Languages configured on the Sitecore instance. */
  instanceLanguages?: SitecoreLanguage[];  /** Languages available for the selected site (from site root item versions). */
  siteLanguages?: SitecoreLanguage[];
  selectedSiteName?: string;
  selectedSiteRootPath?: string;
}
