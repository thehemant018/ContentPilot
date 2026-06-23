"use client";

import { useEffect, useState } from "react";
import {
  addMatchToQueue,
  isMatchInQueue,
  subscribeMigrationQueue,
} from "@/lib/storage/migration-queue";
import {
  markReviewPhaseComplete,
  setFurthestPhaseIndex,
} from "@/lib/workflow/progress";
import { WORKFLOW_PHASES } from "@/lib/workflow/phases";
import type { BlockMatchResult } from "@/types/ai-match";

const SCROLL_PANEL_CLASS =
  "mt-3 max-h-96 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]";

function ConfidenceBadge({ match }: { match: BlockMatchResult }) {
  const styles = {
    high: "bg-emerald-100 text-emerald-800",
    medium: "bg-amber-100 text-amber-800",
    low: "bg-rose-100 text-rose-800",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${styles[match.confidence]}`}
    >
      {match.confidence} · {match.matchScore}%
    </span>
  );
}

function FieldMappingTable({
  mappings,
}: {
  mappings: BlockMatchResult["fieldMappings"];
}) {
  if (mappings.length === 0) {
    return (
      <p className="mt-3 text-sm text-zinc-500">No field mappings suggested.</p>
    );
  }

  return (
    <div className={`${SCROLL_PANEL_CLASS} mt-3 overflow-x-auto`}>
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-2 py-2 font-semibold">Source region</th>
            <th className="px-2 py-2 font-semibold">Source preview</th>
            <th className="px-2 py-2 font-semibold">→</th>
            <th className="px-2 py-2 font-semibold">Sitecore field</th>
            <th className="px-2 py-2 font-semibold">Section</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((mapping, index) => (
            <tr
              key={`${mapping.sitecoreField}-${index}`}
              className="border-b border-zinc-100 align-top"
            >
              <td className="px-2 py-2 font-medium text-zinc-800">
                {mapping.sourceRegion}
              </td>
              <td className="max-w-xs px-2 py-2 text-zinc-600">
                <span className="line-clamp-2">{mapping.sourcePreview}</span>
              </td>
              <td className="px-2 py-2 text-zinc-400">→</td>
              <td className="px-2 py-2">
                <span className="font-mono text-xs text-orange-800">
                  {mapping.sitecoreField}
                </span>
                {mapping.fieldType && (
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {mapping.fieldType}
                  </span>
                )}
              </td>
              <td className="px-2 py-2 text-zinc-600">
                {mapping.section ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchCard({
  match,
  inQueue,
  onAddToQueue,
}: {
  match: BlockMatchResult;
  inQueue: boolean;
  onAddToQueue: (match: BlockMatchResult) => void;
}) {
  return (
    <article
      className={`rounded-xl border bg-white p-4 ${
        match.needsReview ? "border-rose-200 ring-1 ring-rose-100" : "border-zinc-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-zinc-900">
              {match.blockHeading || `${match.blockType} block`}
            </h4>
            <ConfidenceBadge match={match} />
            {match.needsReview && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-rose-800">
                Needs review
              </span>
            )}
            {inQueue && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-violet-800">
                In queue
              </span>
            )}
          </div>
          <p className="mt-1 break-all font-mono text-xs text-zinc-500">
            {match.pageUrl}
          </p>
        </div>
        <button
          type="button"
          disabled={inQueue}
          onClick={() => onAddToQueue(match)}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {inQueue ? "Queued" : "Add to queue"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-orange-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Rendering
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-900">
            {match.renderingName}
          </p>
          {match.renderingPath && (
            <p className="mt-0.5 font-mono text-xs text-zinc-500">
              {match.renderingPath}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-teal-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
            Template
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-900">
            {match.templateName}
          </p>
          {match.templatePath && (
            <p className="mt-0.5 font-mono text-xs text-zinc-500">
              {match.templatePath}
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-600">{match.reasoning}</p>

      <h5 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Field mapping
      </h5>
      <FieldMappingTable mappings={match.fieldMappings} />
    </article>
  );
}

export function MatchResults({
  matches,
  lowConfidenceCount,
  onQueueChange,
}: {
  matches: BlockMatchResult[];
  lowConfidenceCount?: number;
  onQueueChange?: (message: string) => void;
}) {
  const [, setQueueVersion] = useState(0);

  useEffect(() => subscribeMigrationQueue(() => setQueueVersion((v) => v + 1)), []);

  function handleAddToQueue(match: BlockMatchResult): void {
    const outcome = addMatchToQueue(match);
    if (outcome.success) {
      markReviewPhaseComplete();
      const reviewIndex = WORKFLOW_PHASES.findIndex(
        (phase) => phase.id === "review",
      );
      if (reviewIndex >= 0) {
        setFurthestPhaseIndex(reviewIndex);
      }
    }
    onQueueChange?.(outcome.message);
    setQueueVersion((value) => value + 1);
  }

  return (
    <div className="space-y-4">
      {lowConfidenceCount ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {lowConfidenceCount} block(s) have low confidence. Add to queue to
          review and edit in the next phase.
        </div>
      ) : null}

      <div className="space-y-4">
        {matches.map((match) => (
          <MatchCard
            key={`${match.pageUrl}-${match.blockId}`}
            match={match}
            inQueue={isMatchInQueue(match)}
            onAddToQueue={handleAddToQueue}
          />
        ))}
      </div>
    </div>
  );
}
