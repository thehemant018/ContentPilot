export type CrawlMode = "single" | "site";

export type SemanticBlockType =
  | "navigation"
  | "hero"
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
}

export interface CrawledPage {
  url: string;
  title: string;
  blocks: ContentBlock[];
}

export interface CrawlInput {
  url: string;
  mode: CrawlMode;
  maxPages?: number;
}

export interface CrawlResult {
  success: boolean;
  message: string;
  mode?: CrawlMode;
  startUrl?: string;
  pages?: CrawledPage[];
  pageCount?: number;
}
