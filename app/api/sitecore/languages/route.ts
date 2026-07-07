import { NextResponse } from "next/server";
import {
  fetchInstanceLanguages,
  fetchSiteLanguages,
} from "@/lib/sitecore/languages";
import {
  getAuthFromRequest,
  unauthorizedResponse,
} from "@/lib/sitecore/request-auth";

export async function GET(request: Request) {
  const auth = getAuthFromRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const siteRootPath = searchParams.get("siteRootPath")?.trim();

  try {
    const instanceLanguages = await fetchInstanceLanguages(
      auth.instanceUrl,
      auth.accessToken,
    );
    const siteLanguages = siteRootPath
      ? await fetchSiteLanguages(
          auth.instanceUrl,
          auth.accessToken,
          siteRootPath,
        )
      : instanceLanguages;

    return NextResponse.json({
      success: true,
      instanceLanguages,
      siteLanguages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch languages.";

    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}
