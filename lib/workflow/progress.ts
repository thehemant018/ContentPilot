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

export function clearDiscoveryPhaseComplete(): void {
  localStorage.removeItem(STORAGE_KEYS.discoveryComplete);
}

export function resetWorkflowProgress(): void {
  localStorage.setItem(STORAGE_KEYS.workflowFurthestPhase, "0");
  clearDiscoveryPhaseComplete();
  window.dispatchEvent(new Event(WORKFLOW_PROGRESS_EVENT));
}

export function isPhaseComplete(phaseId: WorkflowPhaseId): boolean {
  if (phaseId === "auth") {
    return isAuthPhaseComplete();
  }
  if (phaseId === "discovery") {
    return isDiscoveryPhaseComplete();
  }
  return false;
}

export function getCompletedPhaseIds(): WorkflowPhaseId[] {
  return WORKFLOW_PHASES.filter((phase) => isPhaseComplete(phase.id)).map(
    (phase) => phase.id,
  );
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
    return false;
  }

  if (!phase.available) {
    return false;
  }

  for (let i = 0; i < index; i += 1) {
    const prerequisite = WORKFLOW_PHASES[i];
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
