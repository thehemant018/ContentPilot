import { clearContentMigrationData } from "@/lib/storage/workflow-data";
import { clearMigrationMode, getMigrationMode } from "@/lib/workflow/migration-mode";
import { SESSION_CHANGED_EVENT, STORAGE_KEYS } from "@/lib/sitecore/constants";
import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";
import {
  WORKFLOW_PHASES,
  type WorkflowPhaseId,
  isWorkflowPhaseId,
} from "@/lib/workflow/phases";

export const WORKFLOW_PROGRESS_EVENT = "migratex-workflow-progress-changed";
export const CONTENT_MIGRATION_RESET_EVENT =
  "migratex-content-migration-reset";

function getPhaseIndex(phaseId: WorkflowPhaseId): number {
  return WORKFLOW_PHASES.findIndex((phase) => phase.id === phaseId);
}

export function getFurthestPhaseIndex(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const raw = localStorage.getItem(STORAGE_KEYS.workflowFurthestPhase);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function setFurthestPhaseIndex(index: number): void {
  const current = getFurthestPhaseIndex();
  const next = Math.max(current, index);
  localStorage.setItem(STORAGE_KEYS.workflowFurthestPhase, String(next));
  window.dispatchEvent(new Event(WORKFLOW_PROGRESS_EVENT));
}

export function isAuthPhaseComplete(): boolean {
  const session = getStoredSession();
  return Boolean(session && !isSessionExpired(session));
}

export function isDiscoveryPhaseComplete(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(STORAGE_KEYS.discoveryComplete) === "true";
}

export function markDiscoveryPhaseComplete(): void {
  localStorage.setItem(STORAGE_KEYS.discoveryComplete, "true");
  window.dispatchEvent(new Event(WORKFLOW_PROGRESS_EVENT));
}

export function isMapModePhaseComplete(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(STORAGE_KEYS.mapModeComplete) === "true";
}

export function markMapModePhaseComplete(): void {
  localStorage.setItem(STORAGE_KEYS.mapModeComplete, "true");
  window.dispatchEvent(new Event(WORKFLOW_PROGRESS_EVENT));
}

export function clearMapModePhaseComplete(): void {
  localStorage.removeItem(STORAGE_KEYS.mapModeComplete);
}

export function isCrawlPhaseComplete(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(STORAGE_KEYS.crawlComplete) === "true";
}

export function markCrawlPhaseComplete(): void {
  localStorage.setItem(STORAGE_KEYS.crawlComplete, "true");
  window.dispatchEvent(new Event(WORKFLOW_PROGRESS_EVENT));
}

export function isAiMatchPhaseComplete(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(STORAGE_KEYS.aiMatchComplete) === "true";
}

export function markAiMatchPhaseComplete(): void {
  localStorage.setItem(STORAGE_KEYS.aiMatchComplete, "true");
  window.dispatchEvent(new Event(WORKFLOW_PROGRESS_EVENT));
}

export function isReviewPhaseComplete(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(STORAGE_KEYS.reviewComplete) === "true";
}

export function markReviewPhaseComplete(): void {
  localStorage.setItem(STORAGE_KEYS.reviewComplete, "true");
  window.dispatchEvent(new Event(WORKFLOW_PROGRESS_EVENT));
}

export function clearReviewPhaseComplete(): void {
  localStorage.removeItem(STORAGE_KEYS.reviewComplete);
}

export function isMigratePhaseComplete(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(STORAGE_KEYS.migrateComplete) === "true";
}

export function markMigratePhaseComplete(): void {
  localStorage.setItem(STORAGE_KEYS.migrateComplete, "true");
  window.dispatchEvent(new Event(WORKFLOW_PROGRESS_EVENT));
}

export function clearMigratePhaseComplete(): void {
  localStorage.removeItem(STORAGE_KEYS.migrateComplete);
}

export function clearAiMatchPhaseComplete(): void {
  localStorage.removeItem(STORAGE_KEYS.aiMatchComplete);
}

export function clearCrawlPhaseComplete(): void {
  localStorage.removeItem(STORAGE_KEYS.crawlComplete);
}

export function clearDiscoveryPhaseComplete(): void {
  localStorage.removeItem(STORAGE_KEYS.discoveryComplete);
}

export function resetWorkflowProgress(): void {
  localStorage.setItem(STORAGE_KEYS.workflowFurthestPhase, "0");
  clearDiscoveryPhaseComplete();
  clearMapModePhaseComplete();
  clearMigrationMode();
  clearCrawlPhaseComplete();
  clearAiMatchPhaseComplete();
  clearReviewPhaseComplete();
  clearMigratePhaseComplete();
  window.dispatchEvent(new Event(WORKFLOW_PROGRESS_EVENT));
}

export function getMigrationCycleId(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const raw = localStorage.getItem(STORAGE_KEYS.migrationCycleId);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Reset crawl → migrate phases so the user can migrate another component. */
export function startNewContentMigration(): void {
  const migrationMode = getMigrationMode();
  const nextPhaseId =
    migrationMode === "visual-mapper" ? "map-mode" : "crawl";
  const nextIndex = getPhaseIndex(nextPhaseId);
  if (nextIndex < 0) {
    return;
  }

  clearContentMigrationData();
  clearCrawlPhaseComplete();
  clearAiMatchPhaseComplete();
  clearReviewPhaseComplete();
  clearMigratePhaseComplete();

  localStorage.setItem(STORAGE_KEYS.workflowFurthestPhase, String(nextIndex));
  localStorage.setItem(
    STORAGE_KEYS.migrationCycleId,
    String(getMigrationCycleId() + 1),
  );

  window.dispatchEvent(new Event(WORKFLOW_PROGRESS_EVENT));
  window.dispatchEvent(new Event(CONTENT_MIGRATION_RESET_EVENT));

  if (migrationMode === "visual-mapper") {
    window.location.href = "/visual-mapper";
    return;
  }

  window.location.hash = "crawl";
}

export function isPhaseComplete(phaseId: WorkflowPhaseId): boolean {
  if (phaseId === "auth") {
    return isAuthPhaseComplete();
  }
  if (phaseId === "discovery") {
    return isDiscoveryPhaseComplete();
  }
  if (phaseId === "map-mode") {
    return isMapModePhaseComplete();
  }
  if (phaseId === "crawl") {
    return isCrawlPhaseComplete();
  }
  if (phaseId === "ai-match") {
    return isAiMatchPhaseComplete();
  }
  if (phaseId === "review") {
    return isReviewPhaseComplete();
  }
  if (phaseId === "migrate") {
    return isMigratePhaseComplete();
  }
  return false;
}

export function getCompletedPhaseIds(): WorkflowPhaseId[] {
  return WORKFLOW_PHASES.filter((phase) => isPhaseComplete(phase.id)).map(
    (phase) => phase.id,
  );
}

export function canReturnToReviewForEditing(): boolean {
  return isReviewPhaseComplete() && !isMigratePhaseComplete();
}

export function returnToReviewPhase(): void {
  if (!canReturnToReviewForEditing()) {
    return;
  }

  window.location.hash = "review";
}

export function canNavigateToPhase(
  phaseId: WorkflowPhaseId,
  furthestIndex: number,
): boolean {
  const index = getPhaseIndex(phaseId);
  const phase = WORKFLOW_PHASES[index];

  if (index < 0 || !phase) {
    return false;
  }

  if (index < furthestIndex) {
    if (phaseId === "review" && canReturnToReviewForEditing()) {
      return true;
    }
    if (phaseId === "auth" && !isAuthPhaseComplete()) {
      return true;
    }
    return false;
  }

  if (!phase.available) {
    return false;
  }

  const migrationMode = getMigrationMode();

  if (
    migrationMode === "visual-mapper" &&
    (phaseId === "crawl" || phaseId === "ai-match")
  ) {
    return false;
  }

  for (let i = 0; i < index; i += 1) {
    const prerequisite = WORKFLOW_PHASES[i];
    if (
      migrationMode === "visual-mapper" &&
      (prerequisite.id === "crawl" || prerequisite.id === "ai-match")
    ) {
      continue;
    }
    if (!isPhaseComplete(prerequisite.id)) {
      return false;
    }
  }

  return true;
}

export function getDefaultPhaseFromHash(): WorkflowPhaseId {
  if (typeof window === "undefined") {
    return "auth";
  }

  if (!isAuthPhaseComplete()) {
    return "auth";
  }

  const hash = window.location.hash.replace("#", "");
  const furthestIndex = getFurthestPhaseIndex();

  if (isWorkflowPhaseId(hash) && canNavigateToPhase(hash, furthestIndex)) {
    return hash;
  }

  return WORKFLOW_PHASES[furthestIndex]?.id ?? "auth";
}

export function advanceToWorkflowPhase(phaseId: WorkflowPhaseId): void {
  const index = getPhaseIndex(phaseId);
  if (index < 0) {
    return;
  }

  setFurthestPhaseIndex(index);
  window.location.hash = phaseId;
}

export function subscribeWorkflowProgress(listener: () => void): () => void {
  window.addEventListener(WORKFLOW_PROGRESS_EVENT, listener);
  window.addEventListener(SESSION_CHANGED_EVENT, listener);
  return () => {
    window.removeEventListener(WORKFLOW_PROGRESS_EVENT, listener);
    window.removeEventListener(SESSION_CHANGED_EVENT, listener);
  };
}
