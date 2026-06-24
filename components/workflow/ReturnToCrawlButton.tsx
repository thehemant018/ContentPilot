"use client";

import { startNewContentMigration } from "@/lib/workflow/progress";

const DEFAULT_CONFIRM_MESSAGE =
  "Start over with a different page? Crawl, AI Match, Review queue, and Migrate progress for the current page will be cleared. Auth and Discovery stay connected.";

interface ReturnToCrawlButtonProps {
  variant?: "link" | "button" | "primary";
  className?: string;
  label?: string;
  confirmMessage?: string;
  showArrow?: "left" | "right" | "none";
}

export function ReturnToCrawlButton({
  variant = "link",
  className = "",
  label = "Crawl a different page",
  confirmMessage = DEFAULT_CONFIRM_MESSAGE,
  showArrow = "left",
}: ReturnToCrawlButtonProps) {
  function handleClick(): void {
    if (!window.confirm(confirmMessage)) {
      return;
    }
    startNewContentMigration();
  }

  const arrowPrefix = showArrow === "left" ? "← " : "";
  const arrowSuffix = showArrow === "right" ? " →" : "";
  const text = `${arrowPrefix}${label}${arrowSuffix}`;

  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 ${className}`}
      >
        {text}
      </button>
    );
  }

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-100 ${className}`}
      >
        {text}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`shrink-0 text-sm font-medium text-blue-600 underline-offset-2 hover:underline ${className}`}
    >
      {text}
    </button>
  );
}
