import type { MatchStrategy } from "@/types/ai-match";

const STRATEGY_STYLES: Record<
  MatchStrategy,
  { label: string; className: string }
> = {
  llm: {
    label: "AI matched",
    className: "bg-violet-100 text-violet-800 ring-violet-200",
  },
  "rule-based": {
    label: "Rule-based",
    className: "bg-zinc-200 text-zinc-700 ring-zinc-300",
  },
};

export function MatchStrategyBadge({
  strategy,
  compact = false,
}: {
  strategy?: MatchStrategy;
  compact?: boolean;
}) {
  if (!strategy) {
    return null;
  }

  const { label, className } = STRATEGY_STYLES[strategy];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-semibold uppercase tracking-wide ring-1 ring-inset ${
        compact
          ? "px-1.5 py-0.5 text-[10px]"
          : "px-2 py-0.5 text-[11px]"
      } ${className}`}
    >
      {label}
    </span>
  );
}
