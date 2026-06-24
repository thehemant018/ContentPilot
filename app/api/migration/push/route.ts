import { NextResponse } from "next/server";
import { pushLatestBatchToSitecore } from "@/lib/migration/push-to-sitecore";
import {
  getAuthFromRequest,
  unauthorizedResponse,
} from "@/lib/sitecore/request-auth";
import type { MigrationPushResult } from "@/types/migration-export";

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = getAuthFromRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as { batchId?: string };
    const result = await pushLatestBatchToSitecore(
      auth.instanceUrl,
      auth.accessToken,
      body.batchId,
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
