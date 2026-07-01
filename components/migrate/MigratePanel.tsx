"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SESSION_CHANGED_EVENT } from "@/lib/sitecore/constants";
import { sitecoreApiFetch } from "@/lib/sitecore/api-client";
import {
  BulkPushTargetPageDialog,
  MissingTargetPageDialog,
} from "@/components/migration/TargetPageDialogs";
import {
  uniqueTargetPaths,
  validateTargetPages,
} from "@/lib/migration/validate-target-pages-client";
import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";
import {
  markMigratePhaseComplete,
  isMigratePhaseComplete,
  canReturnToReviewForEditing,
  subscribeWorkflowProgress,
} from "@/lib/workflow/progress";
import { ReturnToCrawlBanner } from "@/components/workflow/ReturnToCrawlBanner";
import { ReturnToMappingSourceButton } from "@/components/workflow/ReturnToMappingSourceButton";
import { isVisualMapperMode } from "@/lib/workflow/migration-mode";
import { ReturnToReviewBanner } from "@/components/workflow/ReturnToReviewBanner";
import { normalizeMediaUploadPath } from "@/lib/sitecore/media-upload";
import { getDiscoveryResult } from "@/lib/storage/workflow-data";
import { getMigrationQueue } from "@/lib/storage/migration-queue";
import { prepareQueueForMigration } from "@/lib/migration/queue-sync";
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
import type { MigrationQueueItem } from "@/types/migration-queue";

export function MigratePanel({ embedded = false }: { embedded?: boolean }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<MigrationPushResult | null>(null);
  const [migrationComplete, setMigrationComplete] = useState(false);
  const [canEditReview, setCanEditReview] = useState(false);
  const [queue, setQueue] = useState<MigrationQueueItem[]>([]);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [singleMissingDialogOpen, setSingleMissingDialogOpen] = useState(false);
  const [pendingMissingPath, setPendingMissingPath] = useState("");
  const [bulkDialogMeta, setBulkDialogMeta] = useState({
    missingCount: 0,
    existingCount: 0,
    totalTargetPages: 0,
    missingPaths: [] as string[],
    existingPaths: [] as string[],
    allTargetPaths: [] as string[],
  });
  const [pageProgressItems, setPageProgressItems] = useState<
    TargetPageProgressItem[]
  >([]);
  const [pageProgressPhase, setPageProgressPhase] = useState<
    "creating" | "pushing" | "done"
  >("creating");

  const refreshQueue = useCallback(() => {
    setQueue(prepareQueueForMigration(getMigrationQueue()));
  }, []);

  const showMigrateAnother = migrationComplete || feedback?.type === "success";

  const refreshConnection = useCallback(() => {
    const session = getStoredSession();
    setIsConnected(Boolean(session && !isSessionExpired(session)));
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      refreshConnection();
      refreshQueue();
      setMigrationComplete(isMigratePhaseComplete());
      setCanEditReview(canReturnToReviewForEditing());
    });

    function handleQueueUpdated() {
      refreshQueue();
    }

    window.addEventListener(SESSION_CHANGED_EVENT, refreshConnection);
    window.addEventListener("migratex-migration-queue-changed", handleQueueUpdated);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refreshConnection);
      window.removeEventListener(
        "migratex-migration-queue-changed",
        handleQueueUpdated,
      );
    };
  }, [refreshConnection, refreshQueue]);

  useEffect(
    () =>
      subscribeWorkflowProgress(() => {
        setMigrationComplete(isMigratePhaseComplete());
        setCanEditReview(canReturnToReviewForEditing());
      }),
    [],
  );

  async function runPushToSitecore(
    createMissingPages: boolean,
    progressContext?: {
      allPaths: string[];
      existingPaths: string[];
    },
  ) {
    const currentQueue = prepareQueueForMigration(getMigrationQueue());
    const mediaLibraryPath = getDiscoveryResult()?.mediaPath?.trim();
    const pageTemplatePath = getDiscoveryResult()?.pageTemplatePath?.trim();
    const sxaPageDataTemplatePath =
      getDiscoveryResult()?.sxaPageDataTemplatePath?.trim();

    if (!mediaLibraryPath) {
      setFeedback({
        type: "error",
        message: "Set the media library path in Discovery (Phase 2) before pushing.",
      });
      return;
    }

    setIsPushing(true);
    setFeedback(null);
    setPushResult(null);

    let shouldCreatePages = createMissingPages;
    let progressItems: TargetPageProgressItem[] = [];

    try {
      if (createMissingPages && progressContext) {
        progressItems = initialPageProgressItems(
          progressContext.allPaths,
          progressContext.existingPaths,
        );
        setPageProgressItems(progressItems);
        setPageProgressPhase("creating");

        const ensureResult = await ensureTargetPagesWithProgress({
          paths: progressContext.allPaths,
          existingPaths: progressContext.existingPaths,
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
          setFeedback({
            type: "error",
            message: "Some target pages could not be created. See progress below.",
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
          queue: currentQueue,
          createMissingPages: shouldCreatePages,
          pageTemplatePath,
          sxaPageDataTemplatePath,
        }),
      });

      const payload = (await response.json()) as MigrationPushResult;
      setPushResult(payload);

      if (progressContext) {
        progressItems = applyPushResultToPageProgress(
          progressItems.length > 0
            ? progressItems
            : initialPageProgressItems(
                progressContext.allPaths,
                progressContext.existingPaths,
              ),
          payload.results ?? [],
        );
        setPageProgressItems(progressItems);
        setPageProgressPhase("done");
      }

      if (!response.ok || !payload.success) {
        setFeedback({
          type: "error",
          message: payload.message ?? "Push to Sitecore failed.",
        });
        return;
      }

      markMigratePhaseComplete();
      setMigrationComplete(true);
      setCanEditReview(false);
      setFeedback({
        type: "success",
        message: payload.message,
      });

      if (progressContext) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Push to Sitecore failed.",
      });
    } finally {
      setIsPushing(false);
      setBulkDialogOpen(false);
      setSingleMissingDialogOpen(false);
      setPageProgressItems([]);
      setPageProgressPhase("creating");
    }
  }

  async function handlePushToSitecore(): Promise<void> {
    const currentQueue = prepareQueueForMigration(getMigrationQueue());
    refreshQueue();

    if (currentQueue.length === 0) {
      setFeedback({
        type: "error",
        message:
          "Review queue is empty. Add components in AI Match and set target page paths in Review.",
      });
      return;
    }

    const missingTarget = currentQueue.filter(
      (item) => !item.targetPagePath.trim(),
    );
    if (missingTarget.length > 0) {
      setFeedback({
        type: "error",
        message: `${missingTarget.length} queued component(s) are missing a target Sitecore page path. Set them in Review (Phase 5).`,
      });
      return;
    }

    if (!isConnected) {
      setFeedback({
        type: "error",
        message: "Connect to Sitecore in Phase 1 before pushing.",
      });
      return;
    }

    const mediaLibraryPath = getDiscoveryResult()?.mediaPath?.trim();
    if (!mediaLibraryPath) {
      setFeedback({
        type: "error",
        message: "Set the media library path in Discovery (Phase 2) before pushing.",
      });
      return;
    }

    const targetPaths = uniqueTargetPaths(
      currentQueue.map((item) => item.targetPagePath),
    );

    try {
      const validation = await validateTargetPages(targetPaths);
      const missingPaths = validation.missingPaths ?? [];

      if (targetPaths.length === 1 && missingPaths.length === 1) {
        setPendingMissingPath(missingPaths[0] ?? targetPaths[0] ?? "");
        setSingleMissingDialogOpen(true);
        return;
      }

      if (targetPaths.length > 1 || missingPaths.length > 0) {
        setBulkDialogMeta({
          missingCount: missingPaths.length,
          existingCount: validation.existingCount,
          totalTargetPages: targetPaths.length,
          missingPaths,
          existingPaths: validation.existingPaths ?? [],
          allTargetPaths: targetPaths,
        });
        setBulkDialogOpen(true);
        return;
      }

      await runPushToSitecore(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to validate target pages.",
      });
    }
  }

  const canPush = Boolean(isConnected && !isPushing && queue.length > 0);

  const pushPreview = useMemo(
    () =>
      queue.map((item) => ({
        id: item.id,
        label: item.blockHeading || item.blockType,
        sourcePageUrl: item.sourcePageUrl,
        targetPagePath: item.targetPagePath,
        renderingName: item.renderingName,
      })),
    [queue],
  );

  const discoveryMediaPath = getDiscoveryResult()?.mediaPath?.trim() ?? "";
  let resolvedMediaUploadFolder: string | null = null;
  if (discoveryMediaPath) {
    try {
      resolvedMediaUploadFolder = normalizeMediaUploadPath(discoveryMediaPath);
    } catch {
      resolvedMediaUploadFolder = null;
    }
  }

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-4xl space-y-6"}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
          Phase 7 — Migrate
        </p>
        <h3 className="mt-1 text-lg font-semibold text-zinc-900">
          Push to Sitecore
        </h3>
        <p className="mt-1 text-sm text-zinc-600">
          Sends your Review queue directly to Sitecore — creates datasource items
          under each target page&apos;s Data folder, fills field values, uploads
          crawled images, and assigns renderings. No local files are stored.
        </p>
        {discoveryMediaPath ? (
          <p className="mt-2 text-xs text-zinc-500">
            Image upload folder:{" "}
            <span className="font-mono">{discoveryMediaPath}</span>
            {resolvedMediaUploadFolder !== null && (
              <>
                {" "}
                →{" "}
                <span className="font-mono">
                  sitecore/media library/{resolvedMediaUploadFolder || "(root)"}
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="mt-2 text-xs text-amber-700">
            No media library path from Discovery. Set it in Phase 2 before
            pushing.
          </p>
        )}
      </div>

      {!showMigrateAnother && <ReturnToCrawlBanner />}

      {canEditReview && <ReturnToReviewBanner />}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
        <div className="space-y-1 text-sm">
          <p className="text-zinc-700">
            Sitecore:{" "}
            <span
              className={
                isConnected ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"
              }
            >
              {isConnected ? "Connected" : "Not connected"}
            </span>
          </p>
          <p className="text-zinc-700">
            Queue:{" "}
            <span className="font-semibold text-zinc-900">
              {queue.length} component{queue.length === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handlePushToSitecore()}
          disabled={!canPush}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPushing ? "Pushing to Sitecore…" : "Push to Sitecore"}
        </button>
      </div>

      {!isConnected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Connect to Sitecore in Phase 1 (Auth) to enable push.
        </div>
      )}

      {queue.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <p className="text-sm font-medium text-zinc-800">Queue is empty</p>
          <p className="mt-2 text-sm text-zinc-600">
            In Review, add components and set target paths, then return here to
            push.
          </p>
        </div>
      )}

      {queue.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm font-semibold text-blue-950">Push preview</p>
          <p className="mt-1 text-xs text-blue-900">
            These settings from your Review queue will be sent to Sitecore.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {pushPreview.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-blue-100 bg-white px-3 py-2"
              >
                <p className="font-medium text-zinc-900">
                  {entry.label}{" "}
                  <span className="text-xs font-normal text-zinc-500">
                    ({entry.renderingName})
                  </span>
                </p>
                <p className="mt-1 font-mono text-xs text-zinc-700">
                  → {entry.targetPagePath}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showMigrateAnother && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
          <p className="text-sm font-semibold text-emerald-900">
            Migration complete
          </p>
          {feedback?.type === "success" && (
            <p className="mt-1 text-sm text-emerald-800">{feedback.message}</p>
          )}
          <ReturnToMappingSourceButton
            variant="primary"
            label="Migrate another component"
            showArrow="right"
            className="mt-4"
            intent="restart"
          />
          <p className="mt-2 text-xs text-emerald-700">
            {isVisualMapperMode()
              ? "Returns to Visual Mapper so you can map another page. Auth and Discovery stay connected."
              : "Returns to Crawl so you can parse a new page and run the workflow again. Auth and Discovery stay connected."}
          </p>
        </div>
      )}

      {feedback && feedback.type === "error" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {feedback.message}
        </div>
      )}

      {pushResult?.results && pushResult.results.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h4 className="text-sm font-semibold text-zinc-900">Push details</h4>
          <ul className="mt-3 space-y-3 text-sm">
            {pushResult.results.map((entry) => (
              <li
                key={entry.queueItemId}
                className="rounded-lg border border-zinc-100 bg-zinc-50 p-3"
              >
                <p className="font-mono text-xs text-zinc-600">
                  {entry.datasourcePath}
                </p>
                {entry.sourcePageUrl && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Source:{" "}
                    <span className="break-all font-mono">
                      {entry.sourcePageUrl}
                    </span>
                  </p>
                )}
                <p className="mt-1 text-zinc-800">
                  Target page:{" "}
                  <span className="font-mono">{entry.targetPagePath}</span>
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  Datasource:{" "}
                  {entry.datasourceCreated
                    ? "created"
                    : entry.datasourceUpdated
                      ? "updated"
                      : "—"}
                  {" · "}
                  Presentation:{" "}
                  {entry.presentationAssigned ? "assigned" : "not assigned"}
                  {(entry.mediaUploaded ?? 0) > 0 && (
                    <>
                      {" · "}
                      Media: {entry.mediaUploaded} uploaded
                    </>
                  )}
                  {(entry.mediaReused ?? 0) > 0 && (
                    <>
                      {" · "}
                      Media: {entry.mediaReused} reused
                    </>
                  )}
                </p>
                {entry.error && (
                  <p className="mt-1 text-xs text-rose-700">{entry.error}</p>
                )}
                {entry.warnings.map((warning) => (
                  <p key={warning} className="mt-1 text-xs text-amber-800">
                    {warning}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <MissingTargetPageDialog
        open={singleMissingDialogOpen}
        targetPagePath={pendingMissingPath}
        isLoading={isPushing}
        progressItems={pageProgressItems}
        progressPhase={pageProgressPhase}
        onCreatePage={() =>
          void runPushToSitecore(true, {
            allPaths: [pendingMissingPath],
            existingPaths: [],
          })
        }
        onCancel={() => {
          if (!isPushing) {
            setSingleMissingDialogOpen(false);
            setPageProgressItems([]);
          }
        }}
      />
      <BulkPushTargetPageDialog
        open={bulkDialogOpen}
        missingCount={bulkDialogMeta.missingCount}
        existingCount={bulkDialogMeta.existingCount}
        totalTargetPages={bulkDialogMeta.totalTargetPages}
        missingPaths={bulkDialogMeta.missingPaths}
        existingPaths={bulkDialogMeta.existingPaths}
        isLoading={isPushing}
        progressItems={pageProgressItems}
        progressPhase={pageProgressPhase}
        onContinue={() =>
          void runPushToSitecore(true, {
            allPaths: bulkDialogMeta.allTargetPaths,
            existingPaths: bulkDialogMeta.existingPaths,
          })
        }
        onCancel={() => {
          if (!isPushing) {
            setBulkDialogOpen(false);
            setPageProgressItems([]);
          }
        }}
      />
    </div>
  );
}
