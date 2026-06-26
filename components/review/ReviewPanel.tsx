"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageMigrationGroup } from "@/components/review/PageMigrationGroup";
import { NextPhaseButton } from "@/components/workflow/NextPhaseButton";
import { ReturnToCrawlBanner } from "@/components/workflow/ReturnToCrawlBanner";
import { validateMigrationQueue } from "@/lib/migration/validate-queue";
import { normalizeSourcePageUrl } from "@/lib/migration/sitecore-path";
import {
  getMigrationQueue,
  removeQueueItem,
  saveMigrationQueue,
  subscribeMigrationQueue,
  updateQueueItem,
  updateQueueItemsForSourcePage,
} from "@/lib/storage/migration-queue";
import {
  getAiMatchResult,
  getCrawlResult,
  getDiscoveryResult,
  WORKFLOW_DATA_CHANGED_EVENT,
} from "@/lib/storage/workflow-data";
import {
  advanceToWorkflowPhase,
  isAiMatchPhaseComplete,
  markReviewPhaseComplete,
  setFurthestPhaseIndex,
  subscribeWorkflowProgress,
} from "@/lib/workflow/progress";
import { WORKFLOW_PHASES } from "@/lib/workflow/phases";
import type { MigrationQueueItem } from "@/types/migration-queue";

export function ReviewPanel({ embedded = false }: { embedded?: boolean }) {
  const [queue, setQueue] = useState<MigrationQueueItem[]>([]);
  const [prerequisitesMet, setPrerequisitesMet] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const refreshQueue = useCallback(() => {
    setQueue(getMigrationQueue());
  }, []);

  const refreshPrerequisites = useCallback(() => {
    setPrerequisitesMet(
      isAiMatchPhaseComplete() && Boolean(getAiMatchResult()),
    );
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      refreshQueue();
      refreshPrerequisites();
    });
    return subscribeMigrationQueue(refreshQueue);
  }, [refreshQueue, refreshPrerequisites]);

  useEffect(() => {
    const unsubscribeProgress = subscribeWorkflowProgress(refreshPrerequisites);

    function handleWorkflowDataChanged() {
      refreshPrerequisites();
    }

    window.addEventListener(
      WORKFLOW_DATA_CHANGED_EVENT,
      handleWorkflowDataChanged,
    );
    return () => {
      unsubscribeProgress();
      window.removeEventListener(
        WORKFLOW_DATA_CHANGED_EVENT,
        handleWorkflowDataChanged,
      );
    };
  }, [refreshPrerequisites]);

  function handleUpdatePageSettings(
    sourcePageUrl: string,
    updates: Partial<
      Pick<MigrationQueueItem, "targetPagePath" | "placeholder" | "language">
    >,
  ): void {
    updateQueueItemsForSourcePage(sourcePageUrl, updates);
    refreshQueue();
    if (getMigrationQueue().length > 0) {
      markReviewPhaseComplete();
    }
  }

  function handleUpdateItem(
    id: string,
    updates: Partial<
      Pick<MigrationQueueItem, "fields" | "datasourcePath">
    >,
  ): void {
    updateQueueItem(id, updates);
    refreshQueue();
    if (getMigrationQueue().length > 0) {
      markReviewPhaseComplete();
    }
  }

  function handleRemove(id: string): void {
    removeQueueItem(id);
    refreshQueue();
    setFeedback({ type: "success", message: "Removed from queue." });
  }

  function handleClearQueue(): void {
    saveMigrationQueue([]);
    refreshQueue();
    setFeedback({ type: "success", message: "Queue cleared." });
  }

  function handleContinueToMigrate(): void {
    setFeedback(null);

    const currentQueue = getMigrationQueue();
    const validation = validateMigrationQueue(currentQueue);

    if (!validation.success) {
      setFeedback({
        type: "error",
        message: validation.message,
      });
      return;
    }

    markReviewPhaseComplete();
    const migrateIndex = WORKFLOW_PHASES.findIndex(
      (phase) => phase.id === "migrate",
    );
    if (migrateIndex >= 0) {
      setFurthestPhaseIndex(migrateIndex);
    }
    advanceToWorkflowPhase("migrate");
    setFeedback({
      type: "success",
      message: validation.message,
    });
  }

  const crawlPages = getCrawlResult()?.pages ?? [];
  const targetHints = [
    ...new Set(crawlPages.map((page) => page.url).filter(Boolean)),
  ];
  const readyCount = queue.filter((item) => item.targetPagePath.trim()).length;
  const queueBySourcePage = useMemo(() => {
    const groups = new Map<string, MigrationQueueItem[]>();
    for (const item of queue) {
      const key = normalizeSourcePageUrl(item.sourcePageUrl);
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [queue]);

  if (!prerequisitesMet && queue.length === 0) {
    return (
      <div
        className={
          embedded
            ? "rounded-xl border border-amber-200 bg-amber-50 p-5"
            : "mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6"
        }
      >
        <h3 className="text-lg font-semibold text-amber-900">
          Complete AI Match first
        </h3>
        <p className="mt-2 text-sm text-amber-800">
          Run AI matching and add components to the queue. Queued items appear
          here for review and editing before push.
        </p>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-5xl space-y-6"}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">
          Phase 5 — Review
        </p>
        <h3 className="mt-1 text-lg font-semibold text-zinc-900">
          Migration queue
        </h3>
        <p className="mt-1 text-sm text-zinc-600">
          Set target page paths and SXA placeholders once per source page.
          Each component keeps its own datasource path and field content.
          When you push in Migrate, the queue is sent directly to Sitecore — nothing
          is written to disk.
        </p>
        {getDiscoveryResult()?.mediaPath && (
          <p className="mt-2 text-xs text-zinc-500">
            Media upload folder:{" "}
            <span className="font-mono">{getDiscoveryResult()?.mediaPath}</span>
          </p>
        )}
      </div>

      <ReturnToCrawlBanner />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
        <p className="text-sm text-zinc-700">
          <span className="font-semibold text-zinc-900">{queue.length}</span>{" "}
          in queue ·{" "}
          <span className="font-semibold text-zinc-900">{readyCount}</span>{" "}
          ready to push
        </p>
        <div className="flex flex-wrap gap-2">
          {queue.length > 0 && (
            <button
              type="button"
              onClick={handleClearQueue}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white"
            >
              Clear queue
            </button>
          )}
          <button
            type="button"
            onClick={handleContinueToMigrate}
            disabled={readyCount === 0}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue to Migrate
          </button>
        </div>
      </div>

      {targetHints.length > 0 && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-medium">Crawled source pages (reference)</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {targetHints.slice(0, 8).map((url) => (
              <li key={url} className="break-all">
                {url}
              </li>
            ))}
          </ul>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {queue.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <p className="text-sm font-medium text-zinc-800">Queue is empty</p>
          <p className="mt-2 text-sm text-zinc-600">
            Go to AI Match and click &quot;Add to queue&quot; on components you
            want to migrate.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {queueBySourcePage.map(([sourcePageUrl, items]) => (
            <PageMigrationGroup
              key={sourcePageUrl}
              sourcePageUrl={sourcePageUrl}
              items={items}
              onUpdatePageSettings={handleUpdatePageSettings}
              onUpdateItem={handleUpdateItem}
              onRemoveItem={handleRemove}
            />
          ))}
        </div>
      )}

      {queue.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-6">
          <NextPhaseButton
            currentPhaseId="review"
            className="bg-rose-500 hover:bg-rose-600"
          />
        </div>
      )}
    </div>
  );
}
