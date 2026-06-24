"use client";

import { useCallback, useEffect, useState } from "react";
import { QueueItemCard } from "@/components/review/QueueItemCard";
import { NextPhaseButton } from "@/components/workflow/NextPhaseButton";
import { ReturnToCrawlBanner } from "@/components/workflow/ReturnToCrawlBanner";
import {
  getMigrationQueue,
  removeQueueItem,
  saveMigrationQueue,
  subscribeMigrationQueue,
  updateQueueItem,
} from "@/lib/storage/migration-queue";
import {
  getAiMatchResult,
  getCrawlResult,
  getDiscoveryResult,
} from "@/lib/storage/workflow-data";
import {
  isAiMatchPhaseComplete,
  markReviewPhaseComplete,
  notifyMigrationExportUpdated,
  setFurthestPhaseIndex,
} from "@/lib/workflow/progress";
import { WORKFLOW_PHASES } from "@/lib/workflow/phases";
import type { MigrationExportResult } from "@/types/migration-export";
import type { MigrationQueueItem } from "@/types/migration-queue";

export function ReviewPanel({ embedded = false }: { embedded?: boolean }) {
  const [queue, setQueue] = useState<MigrationQueueItem[]>([]);
  const [prerequisitesMet, setPrerequisitesMet] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [lastExport, setLastExport] = useState<MigrationExportResult | null>(
    null,
  );

  const refreshQueue = useCallback(() => {
    setQueue(getMigrationQueue());
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      refreshQueue();
      setPrerequisitesMet(
        isAiMatchPhaseComplete() && Boolean(getAiMatchResult()),
      );
    });
    return subscribeMigrationQueue(refreshQueue);
  }, [refreshQueue]);

  function handleUpdate(
    id: string,
    updates: Partial<
      Pick<
        MigrationQueueItem,
        | "targetPagePath"
        | "fields"
        | "placeholder"
        | "datasourcePath"
        | "language"
      >
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

  async function handleExportToLocalData(): Promise<void> {
    setIsExporting(true);
    setFeedback(null);

    const currentQueue = getMigrationQueue();
    const missingTarget = currentQueue.filter(
      (item) => !item.targetPagePath.trim(),
    );

    if (missingTarget.length > 0) {
      setFeedback({
        type: "error",
        message: `${missingTarget.length} item(s) are missing a target Sitecore page path.`,
      });
      setIsExporting(false);
      return;
    }

    try {
      const discovery = getDiscoveryResult();
      const response = await fetch("/api/migration/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queue: currentQueue,
          mediaLibraryPath: discovery?.mediaPath,
        }),
      });

      const payload = (await response.json()) as MigrationExportResult;

      if (!response.ok || !payload.success) {
        setFeedback({
          type: "error",
          message: payload.message ?? "Export failed.",
        });
        return;
      }

      setLastExport(payload);
      const migrateIndex = WORKFLOW_PHASES.findIndex(
        (phase) => phase.id === "migrate",
      );
      if (migrateIndex >= 0) {
        setFurthestPhaseIndex(migrateIndex);
      }
      notifyMigrationExportUpdated();
      setFeedback({
        type: "success",
        message: payload.message,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Export to local data failed.",
      });
    } finally {
      setIsExporting(false);
    }
  }

  const crawlPages = getCrawlResult()?.pages ?? [];
  const targetHints = [
    ...new Set(crawlPages.map((page) => page.url).filter(Boolean)),
  ];
  const readyCount = queue.filter((item) => item.targetPagePath.trim()).length;

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
          here for review and editing before export.
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
          Set target page paths, datasource paths, and presentation placeholders.
          Export writes component JSON to the local{" "}
          <span className="font-mono">data/migrations</span> folder. On push,
          crawled image URLs are uploaded to the Discovery media library path.
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
          ready to export
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
            onClick={() => void handleExportToLocalData()}
            disabled={isExporting || readyCount === 0}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? "Exporting…" : "Export to local data"}
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
          {lastExport?.outputDir && feedback.type === "success" && (
            <p className="mt-2 font-mono text-xs">
              Folder: migratex/{lastExport.outputDir}
            </p>
          )}
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
        <div className="space-y-4">
          {queue.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
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
