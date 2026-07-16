export const SITECORE_AUTH_URL = "https://auth.sitecorecloud.io/oauth/token";
export const SITECORE_AUDIENCE = "https://api.sitecorecloud.io";
export const SITECORE_AUTHORING_GRAPHQL_PATH =
  "/sitecore/api/authoring/graphql/v1";

export const STORAGE_KEYS = {
  session: "contentpilot_sitecore_session",
  workflowFurthestPhase: "contentpilot_workflow_furthest_phase",
  discoveryComplete: "contentpilot_discovery_complete",
  mapModeComplete: "contentpilot_map_mode_complete",
  migrationMode: "contentpilot_migration_mode",
  crawlComplete: "contentpilot_crawl_complete",
  aiMatchComplete: "contentpilot_ai_match_complete",
  discoveryResult: "contentpilot_discovery_result",
  crawlResult: "contentpilot_crawl_result",
  aiMatchResult: "contentpilot_ai_match_result",
  llmConfig: "contentpilot_llm_config",
  migrationQueue: "contentpilot_migration_queue",
  reviewComplete: "contentpilot_review_complete",
  migrateComplete: "contentpilot_migrate_complete",
  migrationCycleId: "contentpilot_migration_cycle_id",
  visualMapperSourceLanguages: "contentpilot_visual_mapper_source_languages",
} as const;

export const SESSION_CHANGED_EVENT = "contentpilot-session-changed";
