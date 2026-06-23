import { clearSession } from "@/lib/storage/sitecore-session";
import { resetWorkflowProgress } from "@/lib/workflow/progress";

export function disconnectSitecore(): void {
  clearSession();
  resetWorkflowProgress();
  window.location.hash = "auth";
}
