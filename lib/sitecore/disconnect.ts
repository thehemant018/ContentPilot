import { clearSession } from "@/lib/storage/sitecore-session";
import { clearLlmConfig } from "@/lib/storage/llm-config";
import { clearWorkflowData } from "@/lib/storage/workflow-data";
import { resetWorkflowProgress } from "@/lib/workflow/progress";

export function disconnectSitecore(): void {
  clearSession();
  clearWorkflowData();
  clearLlmConfig();
  resetWorkflowProgress();
  window.location.hash = "auth";
}
