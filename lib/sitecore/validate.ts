import { SITECORE_AUTHORING_GRAPHQL_PATH } from "@/lib/sitecore/constants";
import { normalizeInstanceUrl } from "@/lib/sitecore/auth";

const CONTENT_API_PROBE_QUERY = `query MigrateXConnectionProbe { __typename }`;

export async function verifyContentApiAccess(
  instanceUrl: string,
  accessToken: string,
): Promise<void> {
  const baseUrl = normalizeInstanceUrl(instanceUrl);
  const endpoint = `${baseUrl}${SITECORE_AUTHORING_GRAPHQL_PATH}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: CONTENT_API_PROBE_QUERY }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    data?: { __typename?: string };
    errors?: Array<{ message: string }>;
  };

  if (!response.ok) {
    throw new Error(
      `Content API unreachable (${response.status}): ${response.statusText}`,
    );
  }

  if (payload.errors?.length) {
    throw new Error(
      `Content API returned an error: ${payload.errors[0]?.message ?? "Unknown error"}`,
    );
  }

  if (!payload.data?.__typename) {
    throw new Error("Content API response was unexpected.");
  }
}
