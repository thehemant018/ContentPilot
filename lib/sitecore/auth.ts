import {
  SITECORE_AUDIENCE,
  SITECORE_AUTH_URL,
} from "@/lib/sitecore/constants";
import { SitecoreConnectError } from "@/lib/sitecore/connect-errors";
import { fetchWithTimeout } from "@/lib/sitecore/fetch-with-timeout";
import type { SitecoreTokenResponse } from "@/types/sitecore";

export function normalizeInstanceUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new SitecoreConnectError(
      `Identity Server returned an empty response (${response.status}).`,
      502,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SitecoreConnectError(
      `Identity Server returned an unexpected response (${response.status}).`,
      502,
    );
  }
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

  let response: Response;
  try {
    response = await fetchWithTimeout(SITECORE_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Network request failed.";
    throw new SitecoreConnectError(
      `Cannot reach Sitecore Identity Server (${SITECORE_AUTH_URL}). ${detail}`,
      503,
    );
  }

  const payload = await parseJsonResponse<
    SitecoreTokenResponse & {
      error?: string;
      error_description?: string;
    }
  >(response);

  if (!response.ok) {
    const detail =
      payload.error_description ?? payload.error ?? response.statusText;
    throw new SitecoreConnectError(
      `Identity Server rejected credentials: ${detail}. Regenerate the client secret in XM Cloud Deploy if it was rotated.`,
      401,
    );
  }

  if (!payload.access_token) {
    throw new SitecoreConnectError(
      "Identity Server response did not include an access token.",
      502,
    );
  }

  return payload;
}
