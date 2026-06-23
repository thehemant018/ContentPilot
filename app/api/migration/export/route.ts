import { NextResponse } from "next/server";
import {
  exportQueueToLocalData,
  readLatestExportSummary,
} from "@/lib/migration/write-local-data";
import type { MigrationExportResult } from "@/types/migration-export";
import type { MigrationQueueItem } from "@/types/migration-queue";

export async function GET() {
  try {
    const latest = await readLatestExportSummary();
    return NextResponse.json({ success: true, latest });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read export summary.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      queue?: MigrationQueueItem[];
    };

    const queue = body.queue ?? [];
    const result = await exportQueueToLocalData(queue);

    return NextResponse.json<MigrationExportResult>(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Export to local data failed.";

    return NextResponse.json<MigrationExportResult>(
      { success: false, message },
      { status: 500 },
    );
  }
}
