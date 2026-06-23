import { NextResponse } from "next/server";
import { runDiscovery } from "@/lib/sitecore/discovery/service";
import {
  getAuthFromRequest,
  unauthorizedResponse,
} from "@/lib/sitecore/request-auth";
import type { DiscoveryPathsInput, DiscoveryResult } from "@/types/discovery";

export async function POST(request: Request) {
  const auth = getAuthFromRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as DiscoveryPathsInput;
    const { siteName, renderingsPath, mediaPath, templatesPath } = body;

    if (
      !siteName?.trim() ||
      !renderingsPath?.trim() ||
      !mediaPath?.trim() ||
      !templatesPath?.trim()
    ) {
      return NextResponse.json<DiscoveryResult>(
        {
          success: false,
          message:
            "Site name and all three paths (renderings, media, templates) are required.",
        },
        { status: 400 },
      );
    }

    const result = await runDiscovery(auth.instanceUrl, auth.accessToken, {
      siteName: siteName.trim(),
      renderingsPath: renderingsPath.trim(),
      mediaPath: mediaPath.trim(),
      templatesPath: templatesPath.trim(),
    });

    return NextResponse.json<DiscoveryResult>(result, {
      status: result.success ? 200 : 404,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Discovery request failed.";

    return NextResponse.json<DiscoveryResult>(
      { success: false, message },
      { status: 502 },
    );
  }
}
