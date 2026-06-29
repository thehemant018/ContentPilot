"use client";

import { getMappingSourceBackTarget } from "@/lib/workflow/migration-mode";
import { startNewContentMigration } from "@/lib/workflow/progress";

const DEFAULT_RESTART_CONFIRM =
  "Start over with a different page? Crawl, AI Match, Review queue, and Migrate progress for the current page will be cleared. Auth and Discovery stay connected.";

interface ReturnToMappingSourceButtonProps {
  variant?: "link" | "button" | "primary";
  className?: string;
  label?: string;
  confirmMessage?: string;
  showArrow?: "left" | "right" | "none";
  /** back = return to Visual Mapper or Crawl; restart = clear progress and start fresh */
  intent?: "back" | "restart";
}

export function ReturnToMappingSourceButton({
  variant = "link",
  className = "",
  label,
  confirmMessage = DEFAULT_RESTART_CONFIRM,
  showArrow = "left",
  intent = "restart",
}: ReturnToMappingSourceButtonProps) {
  const backTarget = getMappingSourceBackTarget();
  const resolvedLabel =
    label ?? (intent === "back" ? backTarget.label : "Crawl a different page");

  function handleClick(): void {
    if (intent === "back") {
      getMappingSourceBackTarget().navigate();
      return;
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }
    startNewContentMigration();
  }

  const arrowPrefix = showArrow === "left" ? "← " : "";
  const arrowSuffix = showArrow === "right" ? " →" : "";
  const text = `${arrowPrefix}${resolvedLabel}${arrowSuffix}`;

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

/** @deprecated Use ReturnToMappingSourceButton */
export const ReturnToCrawlButton = ReturnToMappingSourceButton;
