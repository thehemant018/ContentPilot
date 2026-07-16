"use client";

interface ModeSelectionCardProps {
  onSelectAiMode: () => void;
  onSelectVisualMapper: () => void;
}

function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672Zm-7.518-.267A8.25 8.25 0 1 1 20.25 10.5M8.288 14.212A5.25 5.25 0 1 1 17.25 10.5"
      />
    </svg>
  );
}

export function ModeSelectionCard({
  onSelectAiMode,
  onSelectVisualMapper,
}: ModeSelectionCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6">
      <h3 className="font-display text-base font-semibold text-slate-900">
        How do you want to map content?
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Choose a mapping workflow for this migration.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onSelectAiMode}
          className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all duration-150 hover:border-teal-300 hover:bg-teal-50/40"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
            <SparkIcon />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            Crawl + AI Match
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Crawl the page and auto-match components using AI scoring.
          </p>
        </button>

        <button
          type="button"
          onClick={onSelectVisualMapper}
          className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all duration-150 hover:border-sky-300 hover:bg-sky-50/40"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 transition-colors group-hover:bg-sky-600 group-hover:text-white">
            <CursorIcon />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            Visual Mapper
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Click elements on the live page and assign fields manually.
          </p>
        </button>
      </div>
    </div>
  );
}
