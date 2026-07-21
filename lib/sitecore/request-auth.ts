import { NextResponse } from "next/server";

export interface SitecoreRequestAuth {
  accessToken: string;
  instanceUrl: string;
  /** Sitecore username for Security Owner on created items. */
  itemOwner?: string;
}

export function getAuthFromRequest(
  request: Request,
): SitecoreRequestAuth | null {
  const authHeader = request.headers.get("Authorization");
  const instanceUrl = request.headers.get("X-Sitecore-Instance-Url");

  if (!authHeader?.startsWith("Bearer ") || !instanceUrl?.trim()) {
    return null;
  }

  const itemOwner = request.headers.get("X-Sitecore-Item-Owner")?.trim();

  return {
    accessToken: authHeader.slice("Bearer ".length),
    instanceUrl: instanceUrl.trim(),
    ...(itemOwner ? { itemOwner } : {}),
  };
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, message: "Missing or invalid Sitecore session headers." },
    { status: 401 },
  );
}
