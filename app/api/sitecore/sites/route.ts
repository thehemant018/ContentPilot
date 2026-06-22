import { NextResponse } from "next/server";
import { fetchSites } from "@/lib/sitecore/discovery/service";
import {
  getAuthFromRequest,
  unauthorizedResponse,
} from "@/lib/sitecore/request-auth";

export async function GET(request: Request) {
  const auth = getAuthFromRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  try {
    const sites = await fetchSites(auth.instanceUrl, auth.accessToken);
    return NextResponse.json({ success: true, sites });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch sites.";

    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}
