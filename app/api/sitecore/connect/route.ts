import { NextResponse } from "next/server";
import { requestAccessToken, normalizeInstanceUrl } from "@/lib/sitecore/auth";
import {
  connectErrorMessage,
  connectErrorStatusCode,
} from "@/lib/sitecore/connect-errors";
import { normalizeSitecoreItemOwner } from "@/lib/sitecore/item-owner";
import { verifyContentApiAccess } from "@/lib/sitecore/validate";
import { verifySitecoreUserExists } from "@/lib/sitecore/verify-user";
import type {
  SitecoreConnectionInput,
  SitecoreConnectionResult,
} from "@/types/sitecore";

export async function POST(request: Request) {
  try {
    let body: SitecoreConnectionInput;
    try {
      body = (await request.json()) as SitecoreConnectionInput;
    } catch {
      return NextResponse.json<SitecoreConnectionResult>(
        {
          success: false,
          message: "Invalid request body. Refresh the page and try again.",
        },
        { status: 400 },
      );
    }

    const { instanceUrl, clientId, clientSecret, itemOwner } = body;

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

    const normalizedOwner = normalizeSitecoreItemOwner(itemOwner ?? "");
    let verifiedOwner: string | undefined;
    if (normalizedOwner) {
      const user = await verifySitecoreUserExists(
        normalizedUrl,
        token.access_token,
        normalizedOwner,
      );
      verifiedOwner = user.name;
    }

    const ownerSuffix = verifiedOwner
      ? ` Item owner verified: ${verifiedOwner}.`
      : "";

    return NextResponse.json<SitecoreConnectionResult>({
      success: true,
      message:
        "Connected to Sitecore XM Cloud. Token issued and Content API verified." +
        ownerSuffix,
      token: token.access_token,
      expiresIn: token.expires_in,
      instanceUrl: normalizedUrl,
      contentApiVerified: true,
      itemOwnerVerified: Boolean(verifiedOwner),
      itemOwner: verifiedOwner,
    });
  } catch (error) {
    const message = connectErrorMessage(error);
    const status = connectErrorStatusCode(error);

    console.error("[sitecore/connect]", message);

    return NextResponse.json<SitecoreConnectionResult>(
      { success: false, message },
      { status },
    );
  }
}
