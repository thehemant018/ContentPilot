"use client";

import { useCallback, useEffect, useState } from "react";
import { SESSION_CHANGED_EVENT } from "@/lib/sitecore/constants";
import { sitecoreApiFetch } from "@/lib/sitecore/api-client";
import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";
import { markMigratePhaseComplete } from "@/lib/workflow/progress";
import type { MigrationExportManifest } from "@/types/migration-export";
import type { MigrationPushResult } from "@/types/migration-export";

interface LatestExportResponse {
  success: boolean;
  latest?: {
    batchId: string;
    exportedAt: string;
    batchDir: string;
    manifest: MigrationExportManifest;
  };
}

export function MigratePanel({ embedded = false }: { embedded?: boolean }) {
  const [latest, setLatest] = useState<LatestExportResponse["latest"] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<MigrationPushResult | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const refreshConnection = useCallback(() => {
    const session = getStoredSession();
    setIsConnected(Boolean(session && !isSessionExpired(session)));
  }, []);

  const loadLatestExport = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/migration/export");
      const payload = (await response.json()) as LatestExportResponse;
      setLatest(payload.latest ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      refreshConnection();
      void loadLatestExport();
    });

    window.addEventListener(SESSION_CHANGED_EVENT, refreshConnection);
    return () =>
      window.removeEventListener(SESSION_CHANGED_EVENT, refreshConnection);
  }, [loadLatestExport, refreshConnection]);

  async function handlePushToSitecore(): Promise<void> {
    if (!latest) {
      setFeedback({
        type: "error",
        message: "Export a batch from Review before pushing to Sitecore.",
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

    setIsPushing(true);
    setFeedback(null);
    setPushResult(null);

    try {
      const response = await sitecoreApiFetch("/api/migration/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: latest.batchId }),
      });

      const payload = (await response.json()) as MigrationPushResult;
      setPushResult(payload);

      if (!response.ok || !payload.success) {
        setFeedback({
          type: "error",
          message: payload.message ?? "Push to Sitecore failed.",
        });
        return;
      }

      markMigratePhaseComplete();
      setFeedback({
        type: "success",
        message: payload.message,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Push to Sitecore failed.",
      });
    } finally {
      setIsPushing(false);
    }
  }

  const canPush = Boolean(latest && isConnected && !isPushing);

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-4xl space-y-6"}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
          Phase 6 — Migrate
        </p>
        <h3 className="mt-1 text-lg font-semibold text-zinc-900">
          Push to Sitecore
        </h3>
        <p className="mt-1 text-sm text-zinc-600">
          Uses the matched Sitecore template and rendering from AI Match (e.g.
          Hero). Creates a content item under the page&apos;s Data item, fills
          your fields, uploads crawled images to the media library, and assigns
          the rendering on the target page.
        </p>
      </div>

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
            Local export:{" "}
            <span className="font-semibold text-zinc-900">
              {latest ? latest.batchId : "None"}
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

      {!loading && !latest && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <p className="text-sm font-medium text-zinc-800">No export yet</p>
          <p className="mt-2 text-sm text-zinc-600">
            In Review, set target paths and click{" "}
            <strong>Export to local data</strong>, then return here to push.
          </p>
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

      {loading ? (
        <p className="text-sm text-zinc-500">Loading export summary…</p>
      ) : latest ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-semibold text-emerald-900">
              Latest export batch
            </p>
            <dl className="mt-3 space-y-2 text-sm text-emerald-950">
              <div className="flex flex-wrap gap-2">
                <dt className="font-medium">Batch ID:</dt>
                <dd className="font-mono">{latest.batchId}</dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="font-medium">Exported:</dt>
                <dd>{new Date(latest.exportedAt).toLocaleString()}</dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="font-medium">Folder:</dt>
                <dd className="font-mono">migratex/{latest.batchDir}</dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="font-medium">Components:</dt>
                <dd>{latest.manifest.componentCount}</dd>
              </div>
            </dl>
          </div>

          {pushResult?.results && pushResult.results.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h4 className="text-sm font-semibold text-zinc-900">
                Push details
              </h4>
              <ul className="mt-3 space-y-3 text-sm">
                {pushResult.results.map((entry) => (
                  <li
                    key={entry.queueItemId}
                    className="rounded-lg border border-zinc-100 bg-zinc-50 p-3"
                  >
                    <p className="font-mono text-xs text-zinc-600">
                      {entry.datasourcePath}
                    </p>
                    <p className="mt-1 text-zinc-800">
                      Page: {entry.targetPagePath}
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
        </div>
      ) : null}
    </div>
  );
}
