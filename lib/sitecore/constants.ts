export const SITECORE_AUTH_URL = "https://auth.sitecorecloud.io/oauth/token";
export const SITECORE_AUDIENCE = "https://api.sitecorecloud.io";
export const SITECORE_AUTHORING_GRAPHQL_PATH =
  "/sitecore/api/authoring/graphql/v1";

export const STORAGE_KEYS = {
  session: "migratex_sitecore_session",
  workflowFurthestPhase: "migratex_workflow_furthest_phase",
  discoveryComplete: "migratex_discovery_complete",
} as const;

export const SESSION_CHANGED_EVENT = "migratex-session-changed";
