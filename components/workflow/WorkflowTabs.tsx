"use client";

import { useCallback, useEffect, useState } from "react";
import { ConnectSitecoreForm } from "@/components/landing/ConnectSitecoreForm";
import { DiscoveryPanel } from "@/components/discovery/DiscoveryPanel";
import { PhasePlaceholder } from "@/components/workflow/PhasePlaceholder";
import { PhaseTabBadge } from "@/components/workflow/PhaseTabBadge";
import {
  WORKFLOW_PHASES,
  type WorkflowPhaseId,
} from "@/lib/workflow/phases";
import {
  canNavigateToPhase,
  getDefaultPhaseFromHash,
  getFurthestPhaseIndex,
  isPhaseComplete,
  setFurthestPhaseIndex,
  subscribeWorkflowProgress,
} from "@/lib/workflow/progress";

function getPhaseIndex(phaseId: WorkflowPhaseId): number {
  return WORKFLOW_PHASES.findIndex((phase) => phase.id === phaseId);
}

export function WorkflowTabs() {
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkflowPhaseId>("auth");
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [, setProgressVersion] = useState(0);

  const refreshProgress = useCallback(() => {
    setFurthestIndex(getFurthestPhaseIndex());
    setProgressVersion((value) => value + 1);
  }, []);

  const selectTab = useCallback(
    (tabId: WorkflowPhaseId) => {
      const index = getPhaseIndex(tabId);
      const furthest = getFurthestPhaseIndex();

      if (!canNavigateToPhase(tabId, furthest)) {
        return;
      }

      setFurthestPhaseIndex(index);
      setFurthestIndex(getFurthestPhaseIndex());
      setActiveTab(tabId);
      window.history.replaceState(null, "", `#${tabId}`);
    },
    [],
  );

  useEffect(() => {
    queueMicrotask(() => {
      setHydrated(true);
      refreshProgress();
      const defaultTab = getDefaultPhaseFromHash();
      setActiveTab(defaultTab);
      if (window.location.hash.replace("#", "") !== defaultTab) {
        window.history.replaceState(null, "", `#${defaultTab}`);
      }
    });

    function handleHashChange() {
      const tab = getDefaultPhaseFromHash();
      setActiveTab(tab);
      setFurthestIndex(getFurthestPhaseIndex());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [refreshProgress]);

  useEffect(() => subscribeWorkflowProgress(refreshProgress), [refreshProgress]);

  const activePhase = WORKFLOW_PHASES.find((phase) => phase.id === activeTab)!;

  return (
    <section id="workflow" className="w-full scroll-mt-24">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Migration workflow
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Complete each phase in order. Finished steps show a checkmark and
          cannot be reopened.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div
          role="tablist"
          aria-label="Migration workflow phases"
          className="flex gap-1 overflow-x-auto border-b border-zinc-200 bg-zinc-50 p-2"
        >
          {WORKFLOW_PHASES.map((phase) => {
            const phaseIndex = getPhaseIndex(phase.id);
            const isActive = activeTab === phase.id;
            const isCompleted = hydrated && isPhaseComplete(phase.id);
            const isDisabled = hydrated
              ? !canNavigateToPhase(phase.id, furthestIndex)
              : phase.id !== "auth";
            const isPreviousStep = hydrated && phaseIndex < furthestIndex;

            return (
              <button
                key={phase.id}
                type="button"
                role="tab"
                id={`tab-${phase.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${phase.id}`}
                aria-disabled={isDisabled}
                disabled={isDisabled}
                title={
                  isPreviousStep
                    ? "This step is already completed"
                    : isDisabled && !phase.available
                      ? "Coming soon"
                      : isDisabled
                        ? "Complete the previous phase first"
                        : undefined
                }
                onClick={() => selectTab(phase.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? `${phase.activeBg} ${phase.activeBorder} ${phase.activeRing} ${phase.labelColor} ring-1 font-semibold`
                    : isDisabled
                      ? "cursor-not-allowed border-transparent font-medium text-zinc-400 opacity-60"
                      : "border-transparent font-medium text-zinc-600 hover:bg-white hover:text-zinc-900"
                }`}
              >
                <PhaseTabBadge
                  number={phase.number}
                  completed={isCompleted}
                  colorClass={phase.color}
                />
                <span className="whitespace-nowrap text-inherit">{phase.name}</span>
                {!phase.available && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      isActive
                        ? "bg-white/80 text-zinc-700"
                        : "bg-zinc-200 text-zinc-600"
                    }`}
                  >
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-6">
          {WORKFLOW_PHASES.map((phase) => {
            const isActive = activeTab === phase.id;

            return (
              <div
                key={phase.id}
                role="tabpanel"
                id={`panel-${phase.id}`}
                aria-labelledby={`tab-${phase.id}`}
                hidden={!isActive}
                className={isActive ? "block" : "hidden"}
              >
                {phase.id === "auth" && <ConnectSitecoreForm embedded />}
                {phase.id === "discovery" && <DiscoveryPanel embedded />}
                {!phase.available && <PhasePlaceholder phase={phase} />}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Active phase:{" "}
        <span className={`font-semibold ${activePhase.labelColor}`}>
          {activePhase.number}. {activePhase.name}
        </span>
      </p>
    </section>
  );
}
