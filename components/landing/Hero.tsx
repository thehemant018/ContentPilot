"use client";

import { useState } from "react";
import { PortalInfoDialog } from "@/components/landing/PortalInfoDialog";

export function Hero() {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <section className="animate-rise relative w-full overflow-hidden">
      <div className="relative max-w-3xl">
        <p className="font-display text-sm font-semibold tracking-[0.18em] text-teal-700 uppercase">
          ContentPilot
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.1]">
          Migrate source content into Sitecore{" "}
          <span className="text-teal-600">XM Cloud</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">
          Discover your Sitecore structure, map components, review every field,
          and migrate with confidence — starting from a secure XM Cloud
          connection.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M12 3a9 9 0 100 18 9 9 0 000-18z"
              />
            </svg>
            How it works
          </button>
          <a
            href="#workflow"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            View workflow
          </a>
        </div>
      </div>

      <PortalInfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
    </section>
  );
}
