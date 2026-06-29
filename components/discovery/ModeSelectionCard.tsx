"use client";

interface ModeSelectionCardProps {
  onSelectAiMode: () => void;
  onSelectVisualMapper: () => void;
}

export function ModeSelectionCard({
  onSelectAiMode,
  onSelectVisualMapper,
}: ModeSelectionCardProps) {
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-6">
      <h3 className="text-base font-semibold text-zinc-900">
        How do you want to map content?
      </h3>
      <p className="mt-1 text-sm text-zinc-600">
        Choose a mapping workflow for this migration.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onSelectAiMode}
          className="rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-all hover:border-violet-300 hover:ring-2 hover:ring-violet-100"
        >
          <span className="text-2xl" aria-hidden>
            🤖
          </span>
          <p className="mt-2 text-sm font-semibold text-zinc-900">Crawl + AI Match</p>
          <p className="mt-1 text-sm text-zinc-600">
            Crawl the page and auto-match components using AI scoring.
          </p>
        </button>

        <button
          type="button"
          onClick={onSelectVisualMapper}
          className="rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:ring-2 hover:ring-blue-100"
        >
          <span className="text-2xl" aria-hidden>
            🖱
          </span>
          <p className="mt-2 text-sm font-semibold text-zinc-900">
            Visual Mapper
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Click elements on the live page and assign fields manually.
          </p>
        </button>
      </div>
    </div>
  );
}
