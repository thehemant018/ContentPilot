import { NextResponse } from "next/server";
import { validateTargetPagePaths } from "@/lib/migration/target-page";
import {
  getAuthFromRequest,
  unauthorizedResponse,
} from "@/lib/sitecore/request-auth";

export async function POST(request: Request) {
  const auth = getAuthFromRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as { paths?: string[] };
    const paths = (body.paths ?? []).map((path) => path.trim()).filter(Boolean);

    if (paths.length === 0) {
      return NextResponse.json(
        { error: "Provide at least one target page path." },
        { status: 400 },
      );
    }

    const results = await validateTargetPagePaths(
      auth.instanceUrl,
      auth.accessToken,
      paths,
    );
    const missing = results.filter((item) => !item.exists);
    const existing = results.filter((item) => item.exists);

    return NextResponse.json({
      results,
      missingCount: missing.length,
      existingCount: existing.length,
      missingPaths: missing.map((item) => item.path),
      existingPaths: existing.map((item) => item.resolvedPath),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to validate target pages.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
