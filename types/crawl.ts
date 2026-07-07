export type CrawlMode = "single" | "site";

export type CrawlFetchMode = "browser" | "static";

export type SemanticBlockType =
  | "navigation"
  | "hero"
  | "quote"
  | "video"
  | "rich-text"
  | "card-grid"
  | "media"
  | "cta"
  | "footer"
  | "form"
  | "section"
  | "unknown";

export interface CrawlLink {
  href: string;
  text: string;
}

export interface CrawlImage {
  src: string;
  alt: string;
}

export interface ContentBlock {
  id: string;
  type: SemanticBlockType;
  tagName: string;
  selector: string;
  heading?: string;
  text: string;
  htmlSnippet: string;
  links: CrawlLink[];
  images: CrawlImage[];
  order: number;
  /** Parent block id when this block was extracted from a compound section. */
  parentBlockId?: string;
  /** Child items extracted from card grids, testimonial lists, etc. */
  subBlocks?: ContentBlock[];
}

export interface CrawledPage {
  url: string;
  title: string;
  blocks: ContentBlock[];
  /** Detected source language for this page (URL, html lang, hreflang). */
  language?: string;
  /** Languages advertised on this page. */
  availableLanguages?: string[];
  /** hreflang code → absolute URL for alternate language pages. */
  alternateUrls?: Record<string, string>;
}

export interface CrawlInput {
  url: string;
  mode: CrawlMode;
  maxPages?: number;
  /** browser = Playwright render (default); static = raw HTML fetch only */
  fetchMode?: CrawlFetchMode;
}

export interface CrawlResult {
  success: boolean;
  message: string;
  mode?: CrawlMode;
  fetchMode?: CrawlFetchMode;
  startUrl?: string;
  pages?: CrawledPage[];
  pageCount?: number;
  /** Union of languages detected across crawled pages. */
  sourceLanguages?: string[];
}
