"use client";

import { ReturnToReviewButton } from "@/components/workflow/ReturnToReviewButton";

export function ReturnToReviewBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
      <p className="text-sm text-rose-900">
        Need to change target paths, fields, or placeholders? Return to Review
        to edit the queue before pushing.
      </p>
      <ReturnToReviewButton variant="button" />
    </div>
  );
}
