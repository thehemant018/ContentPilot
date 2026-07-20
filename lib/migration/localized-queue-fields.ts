import { extractBlocksFromHtml } from "@/lib/crawl/extract-blocks";
import { fetchPageHtml } from "@/lib/crawl/fetch-html";
import { DEFAULT_MIGRATION_LANGUAGE } from "@/lib/migration/constants";
import { enrichImageFieldAlts } from "@/lib/migration/image-metadata";
import {
  ensureLinkFieldStoredValue,
  isLinkField,
} from "@/lib/migration/link-field";
import {
  matchesLanguageCode,
  normalizeLanguageCode,
} from "@/lib/migration/language-mapping";
import {
  localizeFieldsFromSelectors,
  queueItemUsesVisualMapperSelectors,
} from "@/lib/migration/localize-visual-mapper-fields";
import { resolveLocalizedSourceUrl } from "@/lib/migration/localized-source-url";
import {
  getFieldsForLanguage,
  resolvePrimarySourceLanguage,
} from "@/lib/migration/queue-language-fields";
import type { ContentBlock, CrawledPage, CrawlLink } from "@/types/crawl";
import type {
  EditableFieldValue,
  MigrationQueueItem,
} from "@/types/migration-queue";

export {
  getFieldsForLanguage,
  resolvePrimarySourceLanguage,
} from "@/lib/migration/queue-language-fields";


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

function isLinkOrCtaField(field: EditableFieldValue): boolean {
  if (isLinkField(field.sitecoreField, field.fieldType)) {
    return true;
  }
  const region = field.sourceRegion.trim().toLowerCase();
  return region.includes("link") || region.includes("cta") || region === "link/cta";
}

function pickLocalizedLink(
  block: ContentBlock,
  linkIndex: number,
): CrawlLink | undefined {
  if (block.links.length === 0) {
    return undefined;
  }
  return block.links[Math.min(linkIndex, block.links.length - 1)];
}

function localizeLinkFieldValue(
  field: EditableFieldValue,
  link: CrawlLink | undefined,
  localizedPageUrl: string,
): string {
  if (!link) {
    return ensureLinkFieldStoredValue(
      field.value,
      field.sitecoreField,
      field.fieldType,
      localizedPageUrl,
    );
  }

  const href = link.href?.trim() || "";
  const text = link.text?.trim() || "";
  // Prefer href for URL; always pass localized CTA label so link text updates per language.
  const raw = href || text || field.value;
  return ensureLinkFieldStoredValue(
    raw,
    field.sitecoreField,
    field.fieldType,
    localizedPageUrl,
    text || undefined,
  );
}

function localizeFieldValues(
  fields: EditableFieldValue[],
  block: ContentBlock,
  localizedPageUrl: string,
): EditableFieldValue[] {
  let linkIndex = 0;

  const mapped = fields.map((field) => {
    if (isLinkOrCtaField(field)) {
      const link = pickLocalizedLink(block, linkIndex);
      linkIndex += 1;
      return {
        ...field,
        value: localizeLinkFieldValue(field, link, localizedPageUrl),
      };
    }

    const extracted = extractValueForSourceRegion(block, field.sourceRegion);
    const nextValue = extracted?.trim() || field.value;

    return {
      ...field,
      value: nextValue,
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
  private readonly htmlByUrl = new Map<string, string>();
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

  async getHtml(url: string): Promise<string> {
    const cached = this.htmlByUrl.get(url);
    if (cached) {
      console.info("[localize][cache] hit in-memory html", {
        url,
        htmlLength: cached.length,
      });
      return cached;
    }

    console.info("[localize][cache] fetching HTML for localized page", { url });
    try {
      const { html } = await fetchPageHtml(url, "static");
      this.htmlByUrl.set(url, html);
      console.info("[localize][cache] fetched html", {
        url,
        htmlLength: html.length,
      });
      return html;
    } catch (error) {
      console.error("[localize][cache] fetchPageHtml failed", {
        url,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                cause: (error as Error & { cause?: unknown }).cause,
                stack: error.stack,
              }
            : error,
      });
      throw error;
    }
  }

  async getBlocks(url: string): Promise<ContentBlock[]> {
    const cached = this.pages.get(url);
    if (cached) {
      console.info("[localize][cache] hit in-memory blocks", { url, count: cached.length });
      return cached;
    }

    const crawled = this.findCrawledPage(url);
    if (crawled?.blocks?.length) {
      console.info("[localize][cache] hit crawl page blocks", {
        url,
        count: crawled.blocks.length,
      });
      this.pages.set(url, crawled.blocks);
      return crawled.blocks;
    }

    const html = await this.getHtml(url);
    const blocks = extractBlocksFromHtml(html);
    console.info("[localize][cache] extracted blocks from html", {
      url,
      htmlLength: html.length,
      blockCount: blocks.length,
    });
    this.pages.set(url, blocks);
    return blocks;
  }
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
  const editedFields = getFieldsForLanguage(item, language);

  // Prefer Review-edited fields for this language when present.
  // Skip cache that is still identical to the primary language (failed prior load).
  if (editedFields) {
    const looksUnlocalized =
      !matchesLanguageCode(
        normalizeLanguageCode(language),
        normalizeLanguageCode(primarySourceLanguage),
      ) &&
      JSON.stringify(editedFields.map((field) => field.value)) ===
        JSON.stringify(item.fields.map((field) => field.value));

    if (!looksUnlocalized) {
      return {
        item: {
          ...item,
          language,
          fields: editedFields,
        },
        localized: true,
      };
    }

    console.info(
      "[localize] ignoring cached fields that still match primary language",
      { id: item.id, language },
    );
  }

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

  // Visual Mapper queue items use CSS selectors — extract from FR/EN HTML directly.
  if (queueItemUsesVisualMapperSelectors(item.fields)) {
    try {
      const html = await cache.getHtml(localizedUrl);
      const result = localizeFieldsFromSelectors(
        item.fields,
        html,
        localizedUrl,
      );

      console.info("[localize] visual-mapper selector extraction", {
        id: item.id,
        language,
        localizedUrl,
        updatedCount: result.updatedCount,
        missingSelectors: result.missingSelectors,
      });

      if (result.updatedCount === 0) {
        return {
          item: { ...item, language },
          localized: false,
          warning: `Could not extract ${language} field values from ${localizedUrl} via mapped selectors${
            result.missingSelectors.length
              ? ` (missing: ${result.missingSelectors.slice(0, 3).join(", ")})`
              : ""
          }; using original field values.`,
        };
      }

      return {
        item: {
          ...item,
          language,
          fields: result.fields,
        },
        localized: true,
        warning:
          result.missingSelectors.length > 0
            ? `Some ${language} selectors were missing on ${localizedUrl}: ${result.missingSelectors
                .slice(0, 3)
                .join(", ")}`
            : undefined,
      };
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Unknown fetch error";
      return {
        item: { ...item, language },
        localized: false,
        warning: `Could not load ${language} content from ${localizedUrl}: ${detail}`,
      };
    }
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
  localizeFieldValues,
  isLinkOrCtaField,
};
