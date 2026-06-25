import { NextResponse } from "next/server";
import { pushQueueToSitecore } from "@/lib/migration/push-to-sitecore";
import {
  getAuthFromRequest,
  unauthorizedResponse,
} from "@/lib/sitecore/request-auth";
import type { MigrationPushResult } from "@/types/migration-export";
import type { MigrationQueueItem } from "@/types/migration-queue";

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

    const result = await pushQueueToSitecore(
      auth.instanceUrl,
      auth.accessToken,
      {
        mediaLibraryPath: body.mediaLibraryPath ?? "",
        queue: body.queue,
      },
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
