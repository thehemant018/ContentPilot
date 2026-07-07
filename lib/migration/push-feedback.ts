import type { MigrationPushResult } from "@/types/migration-export";

export interface PushFeedbackSummary {
  type: "success" | "warning" | "error";
  message: string;
}

export function summarizePushResult(
  result: MigrationPushResult,
): PushFeedbackSummary {
  if (!result.success) {
    const failed = result.failedCount ?? 0;
    const pushed = result.pushedCount ?? 0;
    return {
      type: "error",
      message:
        result.message ??
        (failed > 0
          ? `Migration failed for ${failed} component(s).`
          : "Migration failed."),
    };
  }

  const entries = result.results ?? [];
  const presentationMissing = entries.filter(
    (entry) => !entry.error && !entry.presentationAssigned,
  ).length;
  const warnings = entries.flatMap((entry) => entry.warnings ?? []);

  if (presentationMissing > 0) {
    return {
      type: "warning",
      message:
        `Saved ${result.pushedCount ?? entries.length} datasource(s), but ${presentationMissing} rendering(s) were not assigned to the page layout. ` +
        "Open the target page in Sitecore Experience Editor and check the placeholder (default: headless-main), or use Review to set it. " +
        (warnings[0] ? `Detail: ${warnings[0]}` : ""),
    };
  }

  if (warnings.length > 0) {
    return {
      type: "warning",
      message: `${result.message ?? "Migration completed with warnings."} ${warnings[0]}`,
    };
  }

  return {
    type: "success",
    message:
      result.message ??
      `Pushed ${result.pushedCount ?? entries.length} component(s) to Sitecore.`,
  };
}
