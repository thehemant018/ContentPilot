import { NextResponse } from "next/server";
import { ensureTargetPagesExist } from "@/lib/migration/target/target-page";
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
    const body = (await request.json()) as {
      paths?: string[];
      pageTemplatePath?: string;
      sxaPageDataTemplatePath?: string;
      language?: string;
    };

    const paths = (body.paths ?? []).map((path) => path.trim()).filter(Boolean);
    if (paths.length === 0) {
      return NextResponse.json(
        { error: "Provide at least one target page path." },
        { status: 400 },
      );
    }

    const result = await ensureTargetPagesExist(
      auth.instanceUrl,
      auth.accessToken,
      paths,
      {
        language: body.language?.trim() || "en",
        pageTemplatePath: body.pageTemplatePath,
        sxaPageDataTemplatePath: body.sxaPageDataTemplatePath,
      },
    );

    const failed = result.results.filter((entry) => entry.error);
    return NextResponse.json({
      results: result.results,
      created: result.created,
      existing: result.existing,
      pathByRequested: result.pathByRequested,
      failedCount: failed.length,
      success: failed.length === 0,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create target pages.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
