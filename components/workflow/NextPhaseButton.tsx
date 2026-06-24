"use client";

import { getNextPhaseId, getPhaseById, type WorkflowPhaseId } from "@/lib/workflow/phases";
import { advanceToWorkflowPhase } from "@/lib/workflow/progress";

interface NextPhaseButtonProps {
  currentPhaseId: WorkflowPhaseId;
  className?: string;
}

export function NextPhaseButton({
  currentPhaseId,
  className = "bg-zinc-900 hover:bg-zinc-800",
}: NextPhaseButtonProps) {
  const nextPhaseId = getNextPhaseId(currentPhaseId);

  if (!nextPhaseId) {
    return null;
  }

  const nextPhase = getPhaseById(nextPhaseId);

  return (
    <button
      type="button"
      onClick={() => advanceToWorkflowPhase(nextPhaseId)}
      className={`inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${className}`}
    >
      Continue to {nextPhase.name} →
    </button>
  );
}
