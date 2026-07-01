"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MissingTargetPageDialog } from "@/components/migration/TargetPageDialogs";
import { IframeViewer } from "@/components/visual-mapper/IframeViewer";
import { MappingPanel } from "@/components/visual-mapper/MappingPanel";
import {
  visualMapperInputClass,
} from "@/components/visual-mapper/form-styles";
import { sitecoreApiFetch } from "@/lib/sitecore/api-client";
import { validateTargetPages } from "@/lib/migration/validate-target-pages-client";
import { getDiscoveryResult } from "@/lib/storage/workflow-data";
import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";
import {
  appendVisualMapperToMigrationQueue,
  enqueueVisualMapperMappings,
} from "@/lib/visual-mapper/run-migration";
import { getVisualMapperSiteId } from "@/lib/visual-mapper/session-storage";
import {
  hasCompleteMapping,
  useVisualMapperStore,
} from "@/lib/visual-mapper/store";
import {
  advanceToWorkflowPhase,
  markAiMatchPhaseComplete,
  markCrawlPhaseComplete,
  markMapModePhaseComplete,
  markMigratePhaseComplete,
} from "@/lib/workflow/progress";
import { saveMigrationMode } from "@/lib/workflow/migration-mode";
import { summarizePushResult } from "@/lib/migration/push-feedback";
import {
  applyPushResultToPageProgress,
  ensureTargetPagesWithProgress,
  markPagesAsPushing,
} from "@/lib/migration/ensure-target-page-client";
import {
  initialPageProgressItems,
  type TargetPageProgressItem,
} from "@/types/migration-page-progress";
import type { MigrationPushResult } from "@/types/migration-export";

export function VisualMapperPage() {
  const [urlInput, setUrlInput] = useState("");
  const [highlightSelector, setHighlightSelector] = useState<string | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [missingPageDialogOpen, setMissingPageDialogOpen] = useState(false);
  const [pendingTargetPagePath, setPendingTargetPagePath] = useState("");
  const [pageProgressItems, setPageProgressItems] = useState<
    TargetPageProgressItem[]
  >([]);
  const [pageProgressPhase, setPageProgressPhase] = useState<
    "creating" | "pushing" | "done"
  >("creating");

  const session = useVisualMapperStore((s) => s.session);
  const resetStore = useVisualMapperStore((s) => s.resetStore);
  const setDiscoveryData = useVisualMapperStore((s) => s.setDiscoveryData);
  const loadPage = useVisualMapperStore((s) => s.loadPage);
  const startMigration = useVisualMapperStore((s) => s.startMigration);
  const migrationComplete = useVisualMapperStore((s) => s.migrationComplete);
  const migrationFailed = useVisualMapperStore((s) => s.migrationFailed);

  useEffect(() => {
    const discovery = getDiscoveryResult();
    const siteId = getVisualMapperSiteId() ?? "default";

    if (discovery?.renderings && discovery.templates) {
      setDiscoveryData(
        discovery.renderings,
        discovery.templates,
        siteId,
      );
    }

    return () => {
      resetStore();
    };
  }, [resetStore, setDiscoveryData]);

  const handleHighlightSelector = useCallback((selector: string) => {
    setHighlightSelector(selector);
  }, []);

  const handleClearHighlights = useCallback(() => {
    setHighlightSelector(null);
  }, []);

  function handleLoadPage() {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setFeedback({ type: "error", message: "Enter a source URL." });
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setFeedback({ type: "error", message: "Enter a valid URL." });
      return;
    }

    setFeedback(null);
    loadPage(trimmed);
  }

  function handleGoToReviewQueue() {
    if (session.mappings.length === 0) {
      setFeedback({
        type: "error",
        message: "Add at least one component to the queue before opening Review.",
      });
      return;
    }

    const targetPagePath = useVisualMapperStore.getState().targetPagePath;

    const { added, skipped } = appendVisualMapperToMigrationQueue(
      session.mappings,
      session.sourceUrl,
      document.title,
      targetPagePath,
    );

    saveMigrationMode("visual-mapper");
    markMapModePhaseComplete();
    markCrawlPhaseComplete();
    markAiMatchPhaseComplete();
    advanceToWorkflowPhase("review");
    window.location.href = "/#review";

    if (skipped > 0 && added === 0) {
      setFeedback({
        type: "warning",
        message: `${skipped} component(s) were already in the Review queue. Opening Review…`,
      });
      return;
    }

    if (skipped > 0) {
      setFeedback({
        type: "success",
        message: `Added ${added} component(s) to Review (${skipped} already queued). Opening Review…`,
      });
      return;
    }

    setFeedback({
      type: "success",
      message: `Added ${added} component(s) to the Review queue. Opening Review…`,
    });
  }

  async function runMigratePush(createMissingPages: boolean) {
    const targetPagePath = useVisualMapperStore.getState().targetPagePath;
    const mediaLibraryPath = getDiscoveryResult()?.mediaPath?.trim();
    const pageTemplatePath = getDiscoveryResult()?.pageTemplatePath?.trim();
    const sxaPageDataTemplatePath =
      getDiscoveryResult()?.sxaPageDataTemplatePath?.trim();

    if (!mediaLibraryPath) {
      setFeedback({
        type: "error",
        message: "Discovery media path is required. Complete Phase 2 first.",
      });
      return;
    }

    startMigration();
    setIsMigrating(true);
    setFeedback(null);

    let shouldCreatePages = createMissingPages;
    let progressItems: TargetPageProgressItem[] = [];

    try {
      const { items, partialCount } = enqueueVisualMapperMappings(
        session.mappings,
        session.sourceUrl,
        document.title,
        targetPagePath,
      );

      if (partialCount > 0) {
        setFeedback({
          type: "warning",
          message: `${partialCount} mapping(s) have no field values assigned. Migration will continue with partial data.`,
        });
      }

      if (createMissingPages && targetPagePath.trim()) {
        progressItems = initialPageProgressItems([targetPagePath], []);
        setPageProgressItems(progressItems);
        setPageProgressPhase("creating");

        const ensureResult = await ensureTargetPagesWithProgress({
          paths: [targetPagePath],
          existingPaths: [],
          pageTemplatePath,
          sxaPageDataTemplatePath,
          onProgress: (items) => {
            progressItems = items;
            setPageProgressItems(items);
          },
        });

        if (!ensureResult.success) {
          progressItems = ensureResult.items;
          setPageProgressItems(progressItems);
          setPageProgressPhase("done");
          migrationFailed("Failed to create target page.");
          setFeedback({
            type: "error",
            message: "Failed to create target page. See progress in the dialog.",
          });
          await new Promise((resolve) => setTimeout(resolve, 2500));
          return;
        }

        progressItems = markPagesAsPushing(ensureResult.items);
        setPageProgressItems(progressItems);
        setPageProgressPhase("pushing");
        shouldCreatePages = false;
      }

      const response = await sitecoreApiFetch("/api/migration/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaLibraryPath,
          queue: items,
          createMissingPages: shouldCreatePages,
          pageTemplatePath,
          sxaPageDataTemplatePath,
        }),
      });

      const payload = (await response.json()) as MigrationPushResult;

      if (createMissingPages && targetPagePath.trim()) {
        progressItems = applyPushResultToPageProgress(
          progressItems,
          payload.results ?? [],
        );
        setPageProgressItems(progressItems);
        setPageProgressPhase("done");
      }

      if (!response.ok) {
        migrationFailed(payload.message ?? "Migration failed.");
        setFeedback({
          type: "error",
          message: payload.message ?? "Migration failed.",
        });
        if (createMissingPages) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        return;
      }

      const summary = summarizePushResult(payload);

      if (summary.type === "error") {
        migrationFailed(summary.message);
        setFeedback(summary);
        if (createMissingPages) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        return;
      }

      migrationComplete();
      markMigratePhaseComplete();
      setFeedback(summary);

      if (createMissingPages) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Migration failed.";
      migrationFailed(message);
      setFeedback({ type: "error", message });
    } finally {
      setIsMigrating(false);
      setMissingPageDialogOpen(false);
      setPageProgressItems([]);
      setPageProgressPhase("creating");
    }
  }

  async function handleMigrate() {
    if (session.mappings.length === 0) {
      setFeedback({
        type: "error",
        message: "Add at least one component to the queue before migrating.",
      });
      return;
    }

    const targetPagePath = useVisualMapperStore.getState().targetPagePath;

    if (!targetPagePath.trim()) {
      setFeedback({
        type: "error",
        message: "Enter a target Sitecore page path in the sidebar before migrating.",
      });
      return;
    }

    const sessionData = getStoredSession();
    if (!sessionData || isSessionExpired(sessionData)) {
      setFeedback({
        type: "error",
        message: "Connect to Sitecore in Auth before migrating.",
      });
      return;
    }

    const mediaLibraryPath = getDiscoveryResult()?.mediaPath?.trim();
    if (!mediaLibraryPath) {
      setFeedback({
        type: "error",
        message: "Discovery media path is required. Complete Phase 2 first.",
      });
      return;
    }

    try {
      const validation = await validateTargetPages([targetPagePath]);
      const missing = validation.results.find((item) => !item.exists);

      if (missing) {
        setPendingTargetPagePath(missing.path);
        setMissingPageDialogOpen(true);
        return;
      }

      await runMigratePush(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to validate target page.",
      });
    }
  }

  async function handleCreateMissingPageAndMigrate() {
    await runMigratePush(true);
  }

  const canMigrate =
    hasCompleteMapping(session) && session.mappings.length > 0 && !isMigrating;

  const canOpenReview = session.mappings.length > 0;

  return (
    <div className="flex h-screen flex-col bg-zinc-50 text-zinc-900 scheme-light">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
            Visual Mapper Mode
          </span>
          <input
            type="url"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleLoadPage();
              }
            }}
            placeholder="https://example.com/page"
            className={`min-w-0 flex-1 ${visualMapperInputClass}`}
          />
          <button
            type="button"
            onClick={handleLoadPage}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Load Page
          </button>
        </div>

        <button
          type="button"
          onClick={handleGoToReviewQueue}
          disabled={!canOpenReview}
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Review Queue
          {session.mappings.length > 0 && (
            <span className="ml-1.5 rounded-full bg-rose-200 px-1.5 py-0.5 text-xs">
              {session.mappings.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => void handleMigrate()}
          disabled={!canMigrate}
          title={
            canMigrate
              ? "Push the queued components on this template page to Sitecore"
              : "Add components to the queue and map at least one field"
          }
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isMigrating ? "Migrating…" : "Migrate template page"}
        </button>

        <Link
          href="/#map-mode"
          className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 transition-colors hover:bg-indigo-100"
        >
          Back to Map →
        </Link>
      </header>

      {feedback && (
        <div
          className={`border-b px-4 py-2 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : feedback.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="w-[60%] min-w-0">
          <IframeViewer
            sourceUrl={session.sourceUrl}
            highlightSelector={highlightSelector}
          />
        </div>
        <div className="w-[40%] min-w-0">
          <MappingPanel
            onHighlightSelector={handleHighlightSelector}
            onClearHighlights={handleClearHighlights}
          />
        </div>
      </div>

      <MissingTargetPageDialog
        open={missingPageDialogOpen}
        targetPagePath={pendingTargetPagePath}
        isLoading={isMigrating}
        progressItems={pageProgressItems}
        progressPhase={pageProgressPhase}
        onCreatePage={() => void handleCreateMissingPageAndMigrate()}
        onCancel={() => {
          if (!isMigrating) {
            setMissingPageDialogOpen(false);
            setPageProgressItems([]);
          }
        }}
      />
    </div>
  );
}
