"use client";

import { ModeSelectionCard } from "@/components/discovery/ModeSelectionCard";
import { NextPhaseButton } from "@/components/workflow/NextPhaseButton";
import {
  getMigrationMode,
  saveMigrationMode,
  type MigrationMode,
} from "@/lib/workflow/migration-mode";
import {
  advanceToWorkflowPhase,
  clearQueueOnMapNavigation,
  isDiscoveryPhaseComplete,
  isMapModePhaseComplete,
  markMapModePhaseComplete,
  subscribeWorkflowProgress,
} from "@/lib/workflow/progress";
import { useEffect, useState } from "react";

export function MappingModePanel({ embedded = false }: { embedded?: boolean }) {
  const [discoveryComplete, setDiscoveryComplete] = useState(false);
  const [mapModeComplete, setMapModeComplete] = useState(false);
  const [selectedMode, setSelectedMode] = useState<MigrationMode | null>(null);

  useEffect(() => {
    function refresh() {
      setDiscoveryComplete(isDiscoveryPhaseComplete());
      setMapModeComplete(isMapModePhaseComplete());
      setSelectedMode(getMigrationMode());
    }

    queueMicrotask(refresh);
    return subscribeWorkflowProgress(refresh);
  }, []);

  function handleSelectAiMode() {
    clearQueueOnMapNavigation();
    saveMigrationMode("ai");
    markMapModePhaseComplete();
    advanceToWorkflowPhase("crawl");
  }

  function handleSelectVisualMapper() {
    clearQueueOnMapNavigation();
    saveMigrationMode("visual-mapper");
    markMapModePhaseComplete();
    window.location.href = "/visual-mapper";
  }

  const wrapperClass = embedded
    ? "w-full"
    : "w-full scroll-mt-24 rounded-2xl border border-sky-200 bg-white p-6 shadow-sm ring-1 ring-sky-100";

  if (!discoveryComplete) {
    return (
      <div className={wrapperClass}>
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">
          Phase 3 - Map
        </p>
        <h2 className="font-display mt-1 text-xl font-semibold text-slate-900">
          Choose your mapping approach
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Complete Discovery (Phase 2) first - validate your Sitecore paths and
          load renderings before choosing how to map content.
        </p>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">
          Phase 3 - Map
        </p>
        <h2 className="font-display mt-1 text-xl font-semibold text-slate-900">
          Choose your mapping approach
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Pick how you want to map source content to Sitecore components. You can
          return here later to switch approaches before crawling or mapping.
        </p>
      </div>

      {mapModeComplete && selectedMode && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Current approach:{" "}
          <span className="font-semibold">
            {selectedMode === "ai" ? "Crawl + AI Match" : "Visual Mapper"}
          </span>
          . Choose again below to change, or continue to the next step.
        </div>
      )}

      <div className="mt-8">
        <ModeSelectionCard
          onSelectAiMode={handleSelectAiMode}
          onSelectVisualMapper={handleSelectVisualMapper}
        />
      </div>

      {mapModeComplete && selectedMode === "ai" && (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-6">
          <p className="text-sm text-slate-600">
            Ready to crawl your source site.
          </p>
          <NextPhaseButton
            currentPhaseId="map-mode"
            className="bg-sky-600 hover:bg-sky-700"
          />
        </div>
      )}

      {mapModeComplete && selectedMode === "visual-mapper" && (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-6">
          <p className="text-sm text-slate-600">
            Open Visual Mapper to click and map components on the live page.
          </p>
          <button
            type="button"
            onClick={() => {
              clearQueueOnMapNavigation();
              window.location.href = "/visual-mapper";
            }}
            className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
          >
            Open Visual Mapper →
          </button>
        </div>
      )}
    </div>
  );
}
