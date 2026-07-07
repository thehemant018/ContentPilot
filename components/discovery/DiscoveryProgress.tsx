"use client";

import { useEffect, useRef, useState } from "react";

const DISCOVERY_STEPS = [
  "Validating renderings path",
  "Validating placeholders path",
  "Validating media path",
  "Validating templates path",
  "Loading renderings catalog",
  "Loading placeholder settings",
  "Loading template definitions",
  "Loading language settings",
  "Resolving rendering profiles",
  "Finalizing discovery",
] as const;

const STEP_INTERVAL_MS = 850;

function stepStatus(
  index: number,
  activeIndex: number,
): "done" | "active" | "pending" {
  if (index < activeIndex) {
    return "done";
  }
  if (index === activeIndex) {
    return "active";
  }
  return "pending";
}

export function DiscoveryProgress({ isActive }: { isActive: boolean }) {
  const [activeStep, setActiveStep] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      queueMicrotask(() => setActiveStep(0));
      return;
    }

    queueMicrotask(() => setActiveStep(0));

    intervalRef.current = setInterval(() => {
      setActiveStep((current) =>
        current >= DISCOVERY_STEPS.length - 1 ? current : current + 1,
      );
    }, STEP_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);

  if (!isActive) {
    return null;
  }

  const progressPercent = Math.round(
    ((activeStep + 1) / DISCOVERY_STEPS.length) * 100,
  );

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-teal-900">
          Running discovery…
        </p>
        <p className="text-xs font-medium text-teal-700">
          Step {activeStep + 1} of {DISCOVERY_STEPS.length}
        </p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-teal-100">
        <div
          className="h-full rounded-full bg-teal-500 transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-teal-800">
        {DISCOVERY_STEPS[activeStep]}
      </p>

      <ul className="mt-4 max-h-48 space-y-1.5 overflow-y-auto">
        {DISCOVERY_STEPS.map((label, index) => {
          const status = stepStatus(index, activeStep);

          return (
            <li
              key={label}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                status === "active"
                  ? "bg-white font-medium text-teal-900 ring-1 ring-teal-200"
                  : status === "done"
                    ? "text-teal-700"
                    : "text-zinc-500"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  status === "done"
                    ? "bg-teal-600 text-white"
                    : status === "active"
                      ? "border-2 border-teal-500 border-t-transparent animate-spin bg-white"
                      : "border border-zinc-300 bg-white"
                }`}
                aria-hidden="true"
              >
                {status === "done" && (
                  <svg
                    viewBox="0 0 12 12"
                    className="h-2.5 w-2.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
