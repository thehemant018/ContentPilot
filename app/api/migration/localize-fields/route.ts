import { NextResponse } from "next/server";
import {
  buildPageAlternateUrls,
  LocalizedSourcePageCache,
  localizeQueueItemForLanguage,
  resolvePrimarySourceLanguage,
} from "@/lib/migration/localized-queue-fields";
import { resolveLocalizedSourceUrl } from "@/lib/migration/localized-source-url";
import type { CrawledPage } from "@/types/crawl";
import type { MigrationQueueItem } from "@/types/migration-queue";

export const maxDuration = 60;

interface LocalizeFieldsRequest {
  language: string;
  items: MigrationQueueItem[];
  sourcePages?: CrawledPage[];
}

interface LocalizedItemPayload {
  id: string;
  language: string;
  fields: MigrationQueueItem["fields"];
  contentSourceUrl: string;
  localized: boolean;
  warning?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LocalizeFieldsRequest;
    const language = body.language?.trim();
    const items = Array.isArray(body.items) ? body.items : [];

    console.info("[API][localize-fields] request received", {
      language,
      itemCount: items.length,
      sourcePageCount: body.sourcePages?.length ?? 0,
      sourcePageUrls: (body.sourcePages ?? []).map((page) => page.url),
      items: items.map((item) => ({
        id: item.id,
        blockId: item.blockId,
        sourcePageUrl: item.sourcePageUrl,
        primarySourceLanguage: item.primarySourceLanguage,
        alternateUrls: item.sourceAlternateUrls,
        hasFieldsByLanguage: Boolean(item.fieldsByLanguage),
      })),
    });

    if (!language) {
      console.warn("[API][localize-fields] missing language");
      return NextResponse.json(
        { success: false, message: "Language is required." },
        { status: 400 },
      );
    }

    if (items.length === 0) {
      console.warn("[API][localize-fields] empty items");
      return NextResponse.json(
        { success: false, message: "At least one queue item is required." },
        { status: 400 },
      );
    }

    const sourcePages = body.sourcePages ?? [];
    const cache = new LocalizedSourcePageCache(sourcePages);
    const localizedItems: LocalizedItemPayload[] = [];

    for (const item of items) {
      const alternateUrls = buildPageAlternateUrls(item, sourcePages);
      const resolvedUrl = resolveLocalizedSourceUrl(
        item.sourcePageUrl,
        language,
        {
          alternateUrls,
          primarySourceLanguage: resolvePrimarySourceLanguage(item),
        },
      );

      console.info("[API][localize-fields] localizing item", {
        id: item.id,
        blockId: item.blockId,
        language,
        sourcePageUrl: item.sourcePageUrl,
        resolvedUrl,
        alternateUrls,
        crawlHasResolvedUrl: sourcePages.some((page) => page.url === resolvedUrl),
      });

      try {
        const result = await localizeQueueItemForLanguage(
          item,
          language,
          cache,
          sourcePages,
        );

        console.info("[API][localize-fields] item result", {
          id: item.id,
          language,
          localized: result.localized,
          warning: result.warning,
          fieldCount: result.item.fields.length,
          contentSourceUrl: resolvedUrl,
        });

        localizedItems.push({
          id: item.id,
          language,
          fields: result.item.fields,
          contentSourceUrl: resolvedUrl,
          localized: result.localized,
          warning: result.warning,
        });
      } catch (itemError) {
        console.error("[API][localize-fields] item localization failed", {
          id: item.id,
          language,
          resolvedUrl,
          error:
            itemError instanceof Error
              ? {
                  name: itemError.name,
                  message: itemError.message,
                  cause: (itemError as Error & { cause?: unknown }).cause,
                  stack: itemError.stack,
                }
              : itemError,
        });
        throw itemError;
      }
    }

    console.info("[API][localize-fields] success", {
      language,
      itemCount: localizedItems.length,
      warnings: localizedItems.map((entry) => entry.warning).filter(Boolean),
    });

    return NextResponse.json({
      success: true,
      language,
      items: localizedItems,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load localized field content.";
    console.error("[API][localize-fields] request failed", {
      message,
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
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}
