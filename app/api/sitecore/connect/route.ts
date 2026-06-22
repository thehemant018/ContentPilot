import { NextResponse } from "next/server";
import { requestAccessToken, normalizeInstanceUrl } from "@/lib/sitecore/auth";
import { verifyContentApiAccess } from "@/lib/sitecore/validate";
import type {
  SitecoreConnectionInput,
  SitecoreConnectionResult,
} from "@/types/sitecore";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SitecoreConnectionInput;
    const { instanceUrl, clientId, clientSecret } = body;

    if (!instanceUrl?.trim() || !clientId?.trim() || !clientSecret?.trim()) {
      return NextResponse.json<SitecoreConnectionResult>(
        {
          success: false,
          message: "Instance URL, client ID, and client secret are required.",
        },
        { status: 400 },
      );
    }

    let normalizedUrl: string;
    try {
      const parsed = new URL(instanceUrl.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Invalid protocol");
      }
      normalizedUrl = normalizeInstanceUrl(parsed.origin);
    } catch {
      return NextResponse.json<SitecoreConnectionResult>(
        {
          success: false,
          message: "Enter a valid Sitecore XM instance URL (e.g. https://your-env.sitecorecloud.io).",
        },
        { status: 400 },
      );
    }

    const token = await requestAccessToken(clientId, clientSecret);
    await verifyContentApiAccess(normalizedUrl, token.access_token);

    return NextResponse.json<SitecoreConnectionResult>({
      success: true,
      message: "Connected to Sitecore XM Cloud. Token issued and Content API verified.",
      token: token.access_token,
      expiresIn: token.expires_in,
      instanceUrl: normalizedUrl,
      contentApiVerified: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to connect to Sitecore XM Cloud.";

    return NextResponse.json<SitecoreConnectionResult>(
      { success: false, message },
      { status: 502 },
    );
  }
}
