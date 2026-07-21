"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { WORKFLOW_PHASES } from "@/lib/workflow/phases";

interface PortalInfoDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PortalInfoDialog({ open, onClose }: PortalInfoDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-info-title"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-lg max-h-[min(90vh,40rem)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">
              ContentPilot
            </p>
            <h2
              id="portal-info-title"
              className="font-display mt-1 text-xl font-semibold text-slate-900"
            >
              What this portal does
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          ContentPilot helps you move website content into Sitecore XM Cloud in
          a guided flow — connect securely, discover your Sitecore structure,
          map source content to components, review fields, then push items and
          media.
        </p>

        <ul className="mt-5 space-y-2.5">
          {WORKFLOW_PHASES.map((phase) => (
            <li key={phase.id} className="flex gap-3 text-sm">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${phase.color}`}
              >
                {phase.number}
              </span>
              <span>
                <span className="font-semibold text-slate-800">
                  {phase.name}
                </span>
                <span className="text-slate-500"> — {phase.description}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
          Nothing is written to Sitecore until you explicitly approve a push in
          the Migrate phase.
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Close
          </button>
          <a
            href="#workflow"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
          >
            View workflow
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
