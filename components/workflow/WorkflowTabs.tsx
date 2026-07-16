"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectSitecoreForm } from "@/components/landing/ConnectSitecoreForm";
import { DiscoveryPanel } from "@/components/discovery/DiscoveryPanel";
import { CrawlPanel } from "@/components/crawl/CrawlPanel";
import { AiMatchPanel } from "@/components/ai-match/AiMatchPanel";
import { MatchStrategyBadge } from "@/components/ai-match/MatchStrategyBadge";
import { ReviewPanel } from "@/components/review/ReviewPanel";
import { MigratePanel } from "@/components/migrate/MigratePanel";
import { MappingModePanel } from "@/components/workflow/MappingModePanel";
import { PhasePlaceholder } from "@/components/workflow/PhasePlaceholder";
import { PhaseTabBadge } from "@/components/workflow/PhaseTabBadge";
import {
  WORKFLOW_PHASES,
  type WorkflowPhaseId,
} from "@/lib/workflow/phases";
import {
  canNavigateToPhase,
  canReturnToReviewForEditing,
  canReturnToMapModePhase,
  applyReopenDiscoveryIfRequested,
  clearQueueOnMapNavigation,
  CONTENT_MIGRATION_RESET_EVENT,
  getDefaultPhaseFromHash,
  getFurthestPhaseIndex,
  getMigrationCycleId,
  isAuthPhaseComplete,
  isPhaseComplete,
  setFurthestPhaseIndex,
  subscribeWorkflowProgress,
} from "@/lib/workflow/progress";
import {
  getAiMatchResult,
  WORKFLOW_DATA_CHANGED_EVENT,
} from "@/lib/storage/workflow-data";

function getPhaseIndex(phaseId: WorkflowPhaseId): number {
  return WORKFLOW_PHASES.findIndex((phase) => phase.id === phaseId);
}

export function WorkflowTabs() {
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkflowPhaseId>("auth");
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [migrationCycleId, setMigrationCycleId] = useState(0);
  const [, setProgressVersion] = useState(0);
  const [workflowDataVersion, setWorkflowDataVersion] = useState(0);

  const refreshProgress = useCallback(() => {
    setFurthestIndex(getFurthestPhaseIndex());
    setMigrationCycleId(getMigrationCycleId());
    setProgressVersion((value) => value + 1);

    if (!isAuthPhaseComplete()) {
      setActiveTab("auth");
      if (window.location.hash.replace("#", "") !== "auth") {
        window.history.replaceState(null, "", "#auth");
      }
    }
  }, []);

  const selectTab = useCallback(
    (tabId: WorkflowPhaseId) => {
      const index = getPhaseIndex(tabId);
      const furthest = getFurthestPhaseIndex();

      if (!canNavigateToPhase(tabId, furthest)) {
        return;
      }

      if (tabId === "map-mode") {
        clearQueueOnMapNavigation();
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

      if (applyReopenDiscoveryIfRequested()) {
        refreshProgress();
        setActiveTab("discovery");
        setMigrationCycleId(getMigrationCycleId());
        if (window.location.hash.replace("#", "") !== "discovery") {
          window.history.replaceState(null, "", "#discovery");
        }
        return;
      }

      refreshProgress();
      const defaultTab = getDefaultPhaseFromHash();
      setActiveTab(defaultTab);
      if (window.location.hash.replace("#", "") !== defaultTab) {
        window.history.replaceState(null, "", `#${defaultTab}`);
      }
    });

    function handleHashChange() {
      if (applyReopenDiscoveryIfRequested()) {
        refreshProgress();
        setActiveTab("discovery");
        setMigrationCycleId(getMigrationCycleId());
        return;
      }

      const tab = getDefaultPhaseFromHash();
      setActiveTab(tab);
      setFurthestIndex(getFurthestPhaseIndex());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [refreshProgress]);

  useEffect(() => subscribeWorkflowProgress(refreshProgress), [refreshProgress]);

  useEffect(() => {
    function handleWorkflowDataChanged() {
      setWorkflowDataVersion((value) => value + 1);
    }

    window.addEventListener(WORKFLOW_DATA_CHANGED_EVENT, handleWorkflowDataChanged);
    return () =>
      window.removeEventListener(
        WORKFLOW_DATA_CHANGED_EVENT,
        handleWorkflowDataChanged,
      );
  }, []);

  useEffect(() => {
    function handleMigrationReset() {
      refreshProgress();
      const hash = window.location.hash.replace("#", "");
      if (hash === "map-mode" || hash === "visual-mapper") {
        setActiveTab("map-mode");
        return;
      }
      setActiveTab("crawl");
    }

    window.addEventListener(CONTENT_MIGRATION_RESET_EVENT, handleMigrationReset);
    return () =>
      window.removeEventListener(
        CONTENT_MIGRATION_RESET_EVENT,
        handleMigrationReset,
      );
  }, [refreshProgress]);

  const activePhase = WORKFLOW_PHASES.find((phase) => phase.id === activeTab)!;
  const aiMatchStrategy = useMemo(
    () => (hydrated ? getAiMatchResult()?.matchStrategy : undefined),
    [hydrated, workflowDataVersion],
  );

  return (
    <section id="workflow" className="w-full scroll-mt-24">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Migration workflow
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Complete each phase in order. After Map (step 3), use Crawl + AI Match
          or Visual Mapper — then Review and Migrate.
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
            const canEditReview =
              hydrated &&
              phase.id === "review" &&
              canReturnToReviewForEditing();
            const canEditMapMode =
              hydrated &&
              phase.id === "map-mode" &&
              canReturnToMapModePhase();
            const canReturnToAuth =
              hydrated && phase.id === "auth" && !isAuthPhaseComplete();
            const isPreviousStep =
              hydrated &&
              phaseIndex < furthestIndex &&
              !canEditReview &&
              !canEditMapMode &&
              !canReturnToAuth;

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
                  canReturnToAuth
                    ? "Your session expired — reconnect to Sitecore"
                    : canEditReview
                      ? "Edit migration queue before pushing"
                      : canEditMapMode
                        ? "Change mapping approach or reopen Visual Mapper"
                        : isPreviousStep
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
                {phase.id === "ai-match" && aiMatchStrategy && (
                  <MatchStrategyBadge strategy={aiMatchStrategy} compact />
                )}
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
                {phase.id === "map-mode" && <MappingModePanel embedded />}
                {phase.id === "crawl" && (
                  <CrawlPanel key={`crawl-${migrationCycleId}`} embedded />
                )}
                {phase.id === "ai-match" && (
                  <AiMatchPanel key={`ai-match-${migrationCycleId}`} embedded />
                )}
                {phase.id === "review" && (
                  <ReviewPanel key={`review-${migrationCycleId}`} embedded />
                )}
                {phase.id === "migrate" && (
                  <MigratePanel key={`migrate-${migrationCycleId}`} embedded />
                )}
                {phase.id !== "auth" &&
                  phase.id !== "discovery" &&
                  phase.id !== "map-mode" &&
                  phase.id !== "crawl" &&
                  phase.id !== "ai-match" &&
                  phase.id !== "review" &&
                  phase.id !== "migrate" && <PhasePlaceholder phase={phase} />}
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
