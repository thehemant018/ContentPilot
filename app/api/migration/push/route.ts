import { NextResponse } from "next/server";
import { pushQueueToSitecore } from "@/lib/migration/push/push-to-sitecore";
import { runWithSitecoreItemOwner } from "@/lib/sitecore/item-owner";
import {
  getAuthFromRequest,
  unauthorizedResponse,
} from "@/lib/sitecore/request-auth";
import type { MigrationPushResult } from "@/types/migration-export";
import type { MigrationQueueItem } from "@/types/migration-queue";
import type {
  PlaceholderDefinition,
  RenderingPlaceholderProfile,
} from "@/types/discovery";
import type { CrawledPage } from "@/types/crawl";

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = getAuthFromRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as {
      mediaLibraryPath?: string;
      queue?: MigrationQueueItem[];
      createMissingPages?: boolean;
      pageTemplatePath?: string;
      sxaPageDataTemplatePath?: string;
      placeholders?: PlaceholderDefinition[];
      renderingProfiles?: RenderingPlaceholderProfile[];
      sourcePages?: CrawledPage[];
    };

    if (!body.queue?.length) {
      return NextResponse.json<MigrationPushResult>(
        {
          success: false,
          message: "Review queue is required. Add components in AI Match first.",
        },
        { status: 400 },
      );
    }

    const result = await runWithSitecoreItemOwner(auth.itemOwner, () =>
      pushQueueToSitecore(auth.instanceUrl, auth.accessToken, {
        mediaLibraryPath: body.mediaLibraryPath ?? "",
        queue: body.queue!,
        createMissingPages: body.createMissingPages ?? false,
        pageTemplatePath: body.pageTemplatePath,
        sxaPageDataTemplatePath: body.sxaPageDataTemplatePath,
        placeholders: body.placeholders,
        renderingProfiles: body.renderingProfiles,
        sourcePages: body.sourcePages,
      }),
    );

    return NextResponse.json<MigrationPushResult>(result, {
      status: result.success ? 200 : 502,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Push to Sitecore failed.";

    return NextResponse.json<MigrationPushResult>(
      { success: false, message },
      { status: 500 },
    );
  }
}
