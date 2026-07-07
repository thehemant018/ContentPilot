import { extractBlocksFromHtml } from "@/lib/crawl/extract-blocks";
import { fetchPageHtml } from "@/lib/crawl/fetch-html";
import { DEFAULT_MIGRATION_LANGUAGE } from "@/lib/migration/constants";
import { enrichImageFieldAlts } from "@/lib/migration/image-metadata";
import { ensureLinkFieldStoredValue } from "@/lib/migration/link-field";
import {
  matchesLanguageCode,
  normalizeLanguageCode,
} from "@/lib/migration/language-mapping";
import { resolveLocalizedSourceUrl } from "@/lib/migration/localized-source-url";
import type { ContentBlock, CrawledPage } from "@/types/crawl";
import type {
  EditableFieldValue,
  MigrationQueueItem,
} from "@/types/migration-queue";

function extractVideoEmbedUrl(htmlSnippet: string): string | undefined {
  const match = htmlSnippet.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim();
}

function extractAuthorFromHtml(htmlSnippet: string): string | undefined {
  const figcaptionName = htmlSnippet.match(
    /<figcaption[^>]*>[\s\S]*?<span[^>]*class=["'][^"']*\b(?:font-semibold|author|name)[^"']*["'][^>]*>([^<]+)</i,
  );
  if (figcaptionName?.[1]) {
    return figcaptionName[1].replace(/\s+/g, " ").trim();
  }

  const classMatch = htmlSnippet.match(
    /<[^>]+class=["'][^"']*\bauthor[^"']*["'][^>]*>([^<]+)</i,
  );
  return classMatch?.[1]?.replace(/\s+/g, " ").trim();
}

function extractBlockquoteText(htmlSnippet: string): string | undefined {
  const match = htmlSnippet.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
  if (!match?.[1]) {
    return undefined;
  }

  return match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function findContentBlock(
  blocks: ContentBlock[],
  blockId: string,
  parentBlockId?: string,
): ContentBlock | undefined {
  if (parentBlockId) {
    const parent = blocks.find((block) => block.id === parentBlockId);
    return parent?.subBlocks?.find((block) => block.id === blockId);
  }

  return blocks.find((block) => block.id === blockId);
}

function extractValueForSourceRegion(
  block: ContentBlock,
  sourceRegion: string,
): string | undefined {
  const region = sourceRegion.trim().toLowerCase();

  if (region === "heading" || region.includes("headline")) {
    return block.heading?.trim() || undefined;
  }

  if (
    region === "body text" ||
    region === "description" ||
    region.includes("body") ||
    region.includes("text")
  ) {
    const heading = block.heading?.trim() ?? "";
    const text = block.text.trim();
    if (text && text !== heading) {
      return text;
    }
    return text || undefined;
  }

  if (region === "image" || region.includes("image") || region.includes("media")) {
    return block.images[0]?.src?.trim() || undefined;
  }

  if (region.includes("link") || region.includes("cta") || region === "link/cta") {
    const link = block.links[0];
    return link?.href?.trim() || link?.text?.trim() || undefined;
  }

  if (region.includes("video")) {
    return extractVideoEmbedUrl(block.htmlSnippet);
  }

  if (region.includes("author")) {
    return extractAuthorFromHtml(block.htmlSnippet);
  }

  if (region.includes("quote") || region.includes("blockquote")) {
    return (
      extractBlockquoteText(block.htmlSnippet) ??
      (block.text.trim() || undefined)
    );
  }

  return block.heading?.trim() || block.text.trim() || undefined;
}

function localizeFieldValues(
  fields: EditableFieldValue[],
  block: ContentBlock,
  localizedPageUrl: string,
): EditableFieldValue[] {
  const mapped = fields.map((field) => {
    const extracted = extractValueForSourceRegion(block, field.sourceRegion);
    const nextValue =
      extracted?.trim() ||
      field.value;

    return {
      ...field,
      value: ensureLinkFieldStoredValue(
        nextValue,
        field.sitecoreField,
        field.fieldType,
        localizedPageUrl,
      ),
    };
  });

  return enrichImageFieldAlts(mapped, block.images, localizedPageUrl);
}

export interface LocalizedQueueItemResult {
  item: MigrationQueueItem;
  localized: boolean;
  warning?: string;
}

export class LocalizedSourcePageCache {
  private readonly pages = new Map<string, ContentBlock[]>();
  private readonly crawlPagesByUrl = new Map<string, CrawledPage>();

  constructor(crawlPages: CrawledPage[] = []) {
    for (const page of crawlPages) {
      this.crawlPagesByUrl.set(page.url, page);
    }
  }

  private findCrawledPage(url: string): CrawledPage | undefined {
    for (const [knownUrl, page] of this.crawlPagesByUrl.entries()) {
      if (knownUrl === url) {
        return page;
      }
    }
    return undefined;
  }

  async getBlocks(url: string): Promise<ContentBlock[]> {
    const cached = this.pages.get(url);
    if (cached) {
      return cached;
    }

    const crawled = this.findCrawledPage(url);
    if (crawled?.blocks?.length) {
      this.pages.set(url, crawled.blocks);
      return crawled.blocks;
    }

    const { html } = await fetchPageHtml(url, "static");
    const blocks = extractBlocksFromHtml(html);
    this.pages.set(url, blocks);
    return blocks;
  }
}

export function resolvePrimarySourceLanguage(item: MigrationQueueItem): string {
  return (
    item.primarySourceLanguage?.trim() ||
    item.language?.trim() ||
    DEFAULT_MIGRATION_LANGUAGE
  );
}

export function buildPageAlternateUrls(
  item: MigrationQueueItem,
  crawlPages: CrawledPage[] = [],
): Record<string, string> | undefined {
  if (item.sourceAlternateUrls && Object.keys(item.sourceAlternateUrls).length > 0) {
    return item.sourceAlternateUrls;
  }

  const crawlPage = crawlPages.find((page) => page.url === item.sourcePageUrl);
  if (crawlPage?.alternateUrls && Object.keys(crawlPage.alternateUrls).length > 0) {
    return crawlPage.alternateUrls;
  }

  return undefined;
}

export async function localizeQueueItemForLanguage(
  item: MigrationQueueItem,
  targetLanguage: string,
  cache: LocalizedSourcePageCache,
  crawlPages: CrawledPage[] = [],
): Promise<LocalizedQueueItemResult> {
  const language = targetLanguage.trim() || DEFAULT_MIGRATION_LANGUAGE;
  const primarySourceLanguage = resolvePrimarySourceLanguage(item);

  if (
    matchesLanguageCode(
      normalizeLanguageCode(language),
      normalizeLanguageCode(primarySourceLanguage),
    )
  ) {
    return { item: { ...item, language }, localized: false };
  }

  const alternateUrls = buildPageAlternateUrls(item, crawlPages);
  const localizedUrl = resolveLocalizedSourceUrl(
    item.sourcePageUrl,
    language,
    {
      alternateUrls,
      primarySourceLanguage,
    },
  );

  if (localizedUrl === item.sourcePageUrl) {
    return {
      item: { ...item, language },
      localized: false,
      warning: `Could not resolve a ${language} source URL for ${item.sourcePageUrl}; using original field values.`,
    };
  }

  const blocks = await cache.getBlocks(localizedUrl);
  const block = findContentBlock(blocks, item.blockId, item.parentBlockId);
  if (!block) {
    return {
      item: { ...item, language },
      localized: false,
      warning: `Block ${item.blockId} was not found on ${localizedUrl}; using original field values for ${language}.`,
    };
  }

  return {
    item: {
      ...item,
      language,
      fields: localizeFieldValues(item.fields, block, localizedUrl),
    },
    localized: true,
  };
}

export async function localizeExpandedQueueItems(
  queue: MigrationQueueItem[],
  crawlPages: CrawledPage[] = [],
): Promise<{
  queue: MigrationQueueItem[];
  warningsByComponentKey: Map<string, string>;
}> {
  const cache = new LocalizedSourcePageCache(crawlPages);
  const warningsByComponentKey = new Map<string, string>();
  const localizedQueue: MigrationQueueItem[] = [];

  for (const item of queue) {
    const language = item.language?.trim() || DEFAULT_MIGRATION_LANGUAGE;
    const result = await localizeQueueItemForLanguage(
      item,
      language,
      cache,
      crawlPages,
    );
    localizedQueue.push(result.item);
    if (result.warning) {
      warningsByComponentKey.set(`${item.id}::${language}`, result.warning);
    }
  }

  return { queue: localizedQueue, warningsByComponentKey };
}

export const localizedQueueFieldTesting = {
  findContentBlock,
  extractValueForSourceRegion,
};
