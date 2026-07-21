import { SitecoreConnectError } from "@/lib/sitecore/connect-errors";
import { executeGraphQL, SitecoreGraphQLError } from "@/lib/sitecore/graphql-client";
import { normalizeSitecoreItemOwner } from "@/lib/sitecore/item-owner";

/** Missing user returns user: null. Arg is userName (not name). */
const VALIDATE_USER_QUERY = `
  query ContentPilotValidateUser($userName: String!) {
    user(userName: $userName) {
      name
      localName
      displayName
    }
  }
`;

export interface SitecoreValidatedUser {
  name: string;
  localName?: string;
  displayName?: string;
}

interface ValidateUserGraphResult {
  user?: {
    name?: string | null;
    localName?: string | null;
    displayName?: string | null;
  } | null;
}

function userLookupCandidates(itemOwner: string): string[] {
  const normalized = normalizeSitecoreItemOwner(itemOwner);
  if (!normalized) {
    return [];
  }

  const localName = normalized.includes("\\")
    ? normalized.slice(normalized.indexOf("\\") + 1)
    : normalized;

  return Array.from(new Set([normalized, localName].filter(Boolean)));
}

/**
 * After client credentials succeed, confirm an optional Item owner exists in Sitecore.
 * Uses Security GraphQL: user(name) → null when the account is missing.
 */
export async function verifySitecoreUserExists(
  instanceUrl: string,
  accessToken: string,
  itemOwner: string,
): Promise<SitecoreValidatedUser> {
  const normalized = normalizeSitecoreItemOwner(itemOwner);
  if (!normalized) {
    throw new SitecoreConnectError("Item owner username is empty.", 400);
  }

  const candidates = userLookupCandidates(normalized);
  let lastGraphError: string | undefined;

  for (const name of candidates) {
    try {
      const data = await executeGraphQL<ValidateUserGraphResult>(
        instanceUrl,
        accessToken,
        VALIDATE_USER_QUERY,
        { userName: name },
      );

      const user = data.user;
      if (user) {
        return {
          name: user.name?.trim() || normalized,
          localName: user.localName?.trim() || undefined,
          displayName: user.displayName?.trim() || undefined,
        };
      }
    } catch (error) {
      if (error instanceof SitecoreGraphQLError) {
        lastGraphError = error.message;
        if (/Cannot query field|Unknown argument|user/i.test(error.message)) {
          break;
        }
        continue;
      }
      throw error;
    }
  }

  if (lastGraphError) {
    throw new SitecoreConnectError(
      `Could not validate Sitecore user "${normalized}": ${lastGraphError}. ` +
        "Confirm the automation client can query Security users, or leave Item owner blank.",
      502,
    );
  }

  throw new SitecoreConnectError(
    `Sitecore user "${normalized}" was not found. ` +
      "Enter a valid username (e.g. sitecore\\abc.company.com) or leave Item owner blank to keep the client ID as Owner.",
    400,
  );
}
