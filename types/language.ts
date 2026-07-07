/** Language configured in the Sitecore instance (/sitecore/system/Languages). */
export interface SitecoreLanguage {
  /** Sitecore language name (e.g. en, en-US, fr-FR). */
  name: string;
  path?: string;
  /** Regional ISO code from the language definition item. */
  iso?: string;
  nativeName?: string;
  englishName?: string;
}

export interface SourcePageLanguage {
  /** Best-effort language for this crawled page. */
  detectedLanguage?: string;
  /** Languages linked or advertised on the page (hreflang, html lang, URL). */
  availableLanguages: string[];
  /** hreflang code → absolute URL for alternate language pages. */
  alternateUrls?: Record<string, string>;
}
