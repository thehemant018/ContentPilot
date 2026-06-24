"use client";

import { returnToReviewPhase } from "@/lib/workflow/progress";

interface ReturnToReviewButtonProps {
  variant?: "link" | "button";
  className?: string;
  label?: string;
}

export function ReturnToReviewButton({
  variant = "link",
  className = "",
  label = "Back to Review",
}: ReturnToReviewButtonProps) {
  function handleClick(): void {
    returnToReviewPhase();
  }

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-100 ${className}`}
      >
        ← {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`shrink-0 text-sm font-medium text-rose-600 underline-offset-2 hover:underline ${className}`}
    >
      ← {label}
    </button>
  );
}
