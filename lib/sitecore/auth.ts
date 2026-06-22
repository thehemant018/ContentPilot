import {
  SITECORE_AUDIENCE,
  SITECORE_AUTH_URL,
} from "@/lib/sitecore/constants";
import type { SitecoreTokenResponse } from "@/types/sitecore";

export function normalizeInstanceUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function requestAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<SitecoreTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId.trim(),
    client_secret: clientSecret.trim(),
    audience: SITECORE_AUDIENCE,
  });

  const response = await fetch(SITECORE_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json()) as SitecoreTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    const detail =
      payload.error_description ?? payload.error ?? response.statusText;
    throw new Error(`Identity Server rejected credentials: ${detail}`);
  }

  if (!payload.access_token) {
    throw new Error("Identity Server response did not include an access token.");
  }

  return payload;
}
