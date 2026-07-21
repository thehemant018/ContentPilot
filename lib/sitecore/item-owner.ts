/** Sitecore shared Security field shown as "Owner" in Content Editor. */
export const SITECORE_OWNER_FIELD = "__Owner";

/**
 * Request-scoped owner for server create/push flows.
 * Avoids node:async_hooks so this module stays safe for client import graphs.
 */
let requestScopedItemOwner = "";

/**
 * Normalize to Sitecore account form: sitecore\user.name
 * Accepts "user", "sitecore\\user", or "sitecore/user".
 */
export function normalizeSitecoreItemOwner(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  let normalized = trimmed.replace(/\//g, "\\");
  if (!normalized.includes("\\")) {
    normalized = `sitecore\\${normalized}`;
  }
  return normalized;
}

/** Explicit owner, then request-scoped owner from the connect session. */
export function resolveSitecoreItemOwner(
  explicitOwner?: string | null,
): string {
  const fromExplicit = explicitOwner?.trim();
  if (fromExplicit) {
    return normalizeSitecoreItemOwner(fromExplicit);
  }

  if (requestScopedItemOwner.trim()) {
    return normalizeSitecoreItemOwner(requestScopedItemOwner);
  }

  return "";
}

/** Run create/push work with a request-scoped item owner. */
export async function runWithSitecoreItemOwner<T>(
  owner: string | undefined | null,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = requestScopedItemOwner;
  const normalized = resolveSitecoreItemOwner(owner);
  requestScopedItemOwner = normalized;
  try {
    return await fn();
  } finally {
    requestScopedItemOwner = previous;
  }
}

/** Ensure __Owner is set when creating items via client-credentials auth. */
export function withSitecoreItemOwnerFields(
  fields: Record<string, string>,
  explicitOwner?: string | null,
): Record<string, string> {
  const owner = resolveSitecoreItemOwner(explicitOwner);
  if (!owner) {
    return fields;
  }

  if (fields[SITECORE_OWNER_FIELD]?.trim() || fields.Owner?.trim()) {
    return fields;
  }

  return {
    ...fields,
    [SITECORE_OWNER_FIELD]: owner,
  };
}
