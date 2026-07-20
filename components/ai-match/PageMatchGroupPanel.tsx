"use client";

import { MatchCard } from "@/components/ai-match/MatchCard";
import { isMatchInQueue } from "@/lib/storage/migration-queue";
import type { PageMatchGroup } from "@/lib/ai-match/group-by-page";
import type { BlockMatchResult } from "@/types/ai-match";

function summarizePageMatches(matches: BlockMatchResult[]): {
  matched: number;
  unmatched: number;
  inQueue: number;
} {
  let matched = 0;
  let unmatched = 0;
  let inQueue = 0;

  for (const match of matches) {
    if (match.unmatched) {
      unmatched += 1;
    } else {
      matched += 1;
    }
    if (isMatchInQueue(match)) {
      inQueue += 1;
    }
  }

  return { matched, unmatched, inQueue };
}

export function PageMatchGroupPanel({
  group,
  defaultOpen,
  onAddToQueue,
  onRemoveFromQueue,
}: {
  group: PageMatchGroup;
  defaultOpen: boolean;
  onAddToQueue: (match: BlockMatchResult) => void;
  onRemoveFromQueue: (match: BlockMatchResult) => void;
}) {
  const stats = summarizePageMatches(group.matches);

  return (
    <details
      className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Source page
            </p>
            {group.pageTitle && (
              <p className="mt-1 text-sm font-semibold text-zinc-900">
                {group.pageTitle}
              </p>
            )}
            <p className="mt-1 break-all font-mono text-xs text-zinc-600">
              {group.pageUrl}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              {group.matches.length} block{group.matches.length === 1 ? "" : "s"}
            </span>
            {stats.matched > 0 && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                {stats.matched} matched
              </span>
            )}
            {stats.unmatched > 0 && (
              <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                {stats.unmatched} skipped
              </span>
            )}
            {stats.inQueue > 0 && (
              <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                {stats.inQueue} in queue
              </span>
            )}
          </div>
        </div>
      </summary>

      <div className="mt-5 space-y-4 border-t border-zinc-200 pt-5">
        {group.matches.map((match) => (
          <MatchCard
            key={`${match.pageUrl}-${match.blockId}`}
            match={match}
            inQueue={isMatchInQueue(match)}
            hidePageUrl
            onAddToQueue={onAddToQueue}
            onRemoveFromQueue={onRemoveFromQueue}
          />
        ))}
      </div>
    </details>
  );
}
