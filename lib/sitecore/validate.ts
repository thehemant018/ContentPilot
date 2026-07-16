import { SITECORE_AUTHORING_GRAPHQL_PATH } from "@/lib/sitecore/constants";
import { normalizeInstanceUrl } from "@/lib/sitecore/auth";
import { SitecoreConnectError } from "@/lib/sitecore/connect-errors";
import { fetchWithTimeout } from "@/lib/sitecore/fetch-with-timeout";

const CONTENT_API_PROBE_QUERY = `query ContentPilotConnectionProbe { __typename }`;

export async function verifyContentApiAccess(
  instanceUrl: string,
  accessToken: string,
): Promise<void> {
  const baseUrl = normalizeInstanceUrl(instanceUrl);
  const endpoint = `${baseUrl}${SITECORE_AUTHORING_GRAPHQL_PATH}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: CONTENT_API_PROBE_QUERY }),
      cache: "no-store",
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Network request failed.";
    throw new SitecoreConnectError(
      `Cannot reach Sitecore Content API at ${endpoint}. ` +
        "Use the XM Cloud environment URL from Deploy (e.g. https://xmc-your-env.sitecorecloud.io) with no path suffix. " +
        detail,
      502,
    );
  }

  const text = await response.text();
  let payload: {
    data?: { __typename?: string };
    errors?: Array<{ message: string }>;
  };

  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    throw new SitecoreConnectError(
      `Content API at ${endpoint} returned an unexpected response (${response.status}).`,
      502,
    );
  }

  if (!response.ok) {
    throw new SitecoreConnectError(
      `Content API unreachable (${response.status}) at ${endpoint}. ` +
        "Confirm the instance URL matches your XM Cloud environment and the automation client has authoring access.",
      502,
    );
  }

  if (payload.errors?.length) {
    throw new SitecoreConnectError(
      `Content API returned an error: ${payload.errors[0]?.message ?? "Unknown error"}`,
      502,
    );
  }

  if (!payload.data?.__typename) {
    throw new SitecoreConnectError("Content API response was unexpected.", 502);
  }
}
