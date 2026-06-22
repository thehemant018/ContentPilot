import { SITECORE_AUTHORING_GRAPHQL_PATH } from "@/lib/sitecore/constants";
import { normalizeInstanceUrl } from "@/lib/sitecore/auth";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export class SitecoreGraphQLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SitecoreGraphQLError";
  }
}

export async function executeGraphQL<T>(
  instanceUrl: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const endpoint = `${normalizeInstanceUrl(instanceUrl)}${SITECORE_AUTHORING_GRAPHQL_PATH}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const payload = (await response.json()) as GraphQLResponse<T>;

  if (!response.ok) {
    throw new SitecoreGraphQLError(
      `GraphQL request failed (${response.status}): ${response.statusText}`,
    );
  }

  if (payload.errors?.length) {
    throw new SitecoreGraphQLError(
      payload.errors.map((error) => error.message).join("; "),
    );
  }

  if (!payload.data) {
    throw new SitecoreGraphQLError("GraphQL response did not include data.");
  }

  return payload.data;
}
