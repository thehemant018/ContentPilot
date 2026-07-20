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

    if (!language) {
      return NextResponse.json(
        { success: false, message: "Language is required." },
        { status: 400 },
      );
    }

    if (items.length === 0) {
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

      const result = await localizeQueueItemForLanguage(
        item,
        language,
        cache,
        sourcePages,
      );

      localizedItems.push({
        id: item.id,
        language,
        fields: result.item.fields,
        contentSourceUrl: resolvedUrl,
        localized: result.localized,
        warning: result.warning,
      });
    }

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
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}
