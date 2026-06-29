"use client";

import { useEffect, useMemo, useState } from "react";
import { MatchCard } from "@/components/ai-match/MatchCard";
import { PageMatchGroupPanel } from "@/components/ai-match/PageMatchGroupPanel";
import {
  buildPageTitleMap,
  groupMatchesByPage,
} from "@/lib/ai-match/group-by-page";
import {
  addMatchToQueue,
  isMatchInQueue,
  removeMatchFromQueue,
  subscribeMigrationQueue,
} from "@/lib/storage/migration-queue";
import { getCrawlResult } from "@/lib/storage/workflow-data";
import {
  markReviewPhaseComplete,
  setFurthestPhaseIndex,
} from "@/lib/workflow/progress";
import { WORKFLOW_PHASES } from "@/lib/workflow/phases";
import type { BlockMatchResult } from "@/types/ai-match";

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
  const unmatchedCount = matches.filter((match) => match.unmatched).length;
  const matchedCount = matches.length - unmatchedCount;

  const pageGroups = useMemo(() => {
    const pageTitles = buildPageTitleMap(getCrawlResult()?.pages);
    return groupMatchesByPage(matches, pageTitles);
  }, [matches]);

  const multiPage = pageGroups.length > 1;

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

  function handleRemoveFromQueue(match: BlockMatchResult): void {
    const outcome = removeMatchFromQueue(match);
    onQueueChange?.(outcome.message);
    setQueueVersion((value) => value + 1);
  }

  return (
    <div className="space-y-4">
      {multiPage && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-medium">
            {pageGroups.length} source pages — matches grouped by page
          </p>
          <p className="mt-1 text-xs text-blue-800">
            Expand each page to review its mapped components and add them to the
            queue.
          </p>
        </div>
      )}

      {unmatchedCount > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          {matchedCount} block(s) matched to Sitecore components; {unmatchedCount}{" "}
          skipped because no rendering in discovery fits (card grids, stats, rich
          text, etc.). Add matching components in Sitecore or migrate those sections
          manually.
        </div>
      )}

      {lowConfidenceCount ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {lowConfidenceCount} block(s) have low confidence. Add to queue to review
          and edit in the next phase.
        </div>
      ) : null}

      {multiPage ? (
        <div className="space-y-4">
          {pageGroups.map((group, index) => (
            <PageMatchGroupPanel
              key={group.normalizedUrl}
              group={group}
              defaultOpen={index === 0}
              onAddToQueue={handleAddToQueue}
              onRemoveFromQueue={handleRemoveFromQueue}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => (
            <MatchCard
              key={`${match.pageUrl}-${match.blockId}`}
              match={match}
              inQueue={isMatchInQueue(match)}
              onAddToQueue={handleAddToQueue}
              onRemoveFromQueue={handleRemoveFromQueue}
            />
          ))}
        </div>
      )}
    </div>
  );
}
