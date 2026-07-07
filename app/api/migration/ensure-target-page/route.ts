import { NextResponse } from "next/server";
import { ensureTargetPageExists } from "@/lib/migration/target-page";
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
      path?: string;
      pageTemplatePath?: string;
      sxaPageDataTemplatePath?: string;
      language?: string;
    };

    const path = body.path?.trim();
    if (!path) {
      return NextResponse.json(
        { error: "Target page path is required." },
        { status: 400 },
      );
    }

    const result = await ensureTargetPageExists(
      auth.instanceUrl,
      auth.accessToken,
      path,
      {
        language: body.language?.trim() || "en",
        pageTemplatePath: body.pageTemplatePath,
        sxaPageDataTemplatePath: body.sxaPageDataTemplatePath,
      },
    );

    return NextResponse.json({
      path,
      resolvedPath: result.path,
      created: result.created,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create target page.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
