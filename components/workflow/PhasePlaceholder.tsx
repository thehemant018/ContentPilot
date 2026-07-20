import type { WorkflowPhase } from "@/lib/workflow/phases";

interface PhasePlaceholderProps {
  phase: WorkflowPhase;
}

export function PhasePlaceholder({ phase }: PhasePlaceholderProps) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
      <span
        className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white ${phase.color}`}
      >
        {phase.number}
      </span>
      <h3 className="mt-4 text-lg font-semibold text-zinc-900">
        Phase {phase.number} - {phase.name}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
        {phase.description}
      </p>
      <p className="mt-4 inline-flex rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">
        Coming soon
      </p>
    </div>
  );
}
