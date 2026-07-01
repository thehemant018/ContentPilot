"use client";

import type { ReactNode } from "react";
import type { TargetPageProgressItem } from "@/types/migration-page-progress";
import { countPageProgress } from "@/types/migration-page-progress";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  variant?: "default" | "danger";
  hideActions?: boolean;
  maxWidthClass?: string;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isLoading = false,
  variant = "default",
  hideActions = false,
  maxWidthClass = "max-w-md",
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  const confirmClass =
    variant === "danger"
      ? "bg-rose-600 hover:bg-rose-700"
      : "bg-emerald-600 hover:bg-emerald-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className={`w-full ${maxWidthClass} rounded-xl border border-zinc-200 bg-white p-5 shadow-xl`}
      >
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-zinc-900"
        >
          {title}
        </h2>
        <div className="mt-3 text-sm leading-relaxed text-zinc-600">
          {children}
        </div>
        {!hideActions && (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${confirmClass}`}
            >
              {isLoading ? "Please wait…" : confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function progressLabel(status: TargetPageProgressItem["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "creating":
      return "Creating…";
    case "created":
      return "Created";
    case "existing":
      return "Already exists";
    case "pushing":
      return "Pushing…";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function progressBadgeClass(status: TargetPageProgressItem["status"]): string {
  switch (status) {
    case "done":
    case "created":
      return "bg-emerald-100 text-emerald-800";
    case "existing":
      return "bg-sky-100 text-sky-800";
    case "creating":
    case "pushing":
      return "bg-amber-100 text-amber-800";
    case "failed":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

export function PagePushProgressList({
  items,
  phase,
}: {
  items: TargetPageProgressItem[];
  phase: "creating" | "pushing" | "done";
}) {
  const completed = countPageProgress(items, [
    "created",
    "existing",
    "done",
  ]);
  const failed = countPageProgress(items, ["failed"]);
  const inFlight = countPageProgress(items, ["creating", "pushing"]);
  const total = items.length;

  const phaseLabel =
    phase === "creating"
      ? "Creating pages"
      : phase === "pushing"
        ? "Pushing content"
        : "Complete";

  return (
    <div className="mt-4 space-y-3">
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
          <span>{phaseLabel}</span>
          <span>
            {completed}/{total} done
            {failed > 0 ? ` · ${failed} failed` : ""}
            {inFlight > 0 ? ` · ${inFlight} in progress` : ""}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{
              width: `${total === 0 ? 0 : Math.round((completed / total) * 100)}%`,
            }}
          />
        </div>
      </div>

      <ul className="max-h-52 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2">
        {items.map((item) => (
          <li
            key={item.path}
            className="flex items-start justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1 break-all font-mono text-zinc-700">
              {item.path}
            </span>
            <span className="shrink-0 text-right">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${progressBadgeClass(item.status)}`}
              >
                {progressLabel(item.status)}
              </span>
              {item.detail && (
                <p className="mt-0.5 max-w-32 text-[10px] text-zinc-500">
                  {item.detail}
                </p>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface MissingTargetPageDialogProps {
  open: boolean;
  targetPagePath: string;
  isLoading?: boolean;
  progressItems?: TargetPageProgressItem[];
  progressPhase?: "creating" | "pushing" | "done";
  onCreatePage: () => void;
  onCancel: () => void;
}

export function MissingTargetPageDialog({
  open,
  targetPagePath,
  isLoading,
  progressItems,
  progressPhase,
  onCreatePage,
  onCancel,
}: MissingTargetPageDialogProps) {
  const showProgress = Boolean(progressItems?.length && isLoading);

  return (
    <ConfirmDialog
      open={open}
      title={
        showProgress ? "Creating page & pushing content" : "Target page not found in Sitecore"
      }
      confirmLabel="Create page"
      onConfirm={onCreatePage}
      onCancel={onCancel}
      isLoading={isLoading}
      hideActions={showProgress}
      maxWidthClass={showProgress ? "max-w-lg" : "max-w-md"}
    >
      {showProgress && progressItems && progressPhase ? (
        <PagePushProgressList items={progressItems} phase={progressPhase} />
      ) : (
        <>
          <p>The target page you defined does not exist in Sitecore yet:</p>
          <p className="mt-2 break-all rounded-lg bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800">
            {targetPagePath}
          </p>
          <p className="mt-3">
            Click <span className="font-semibold">Create page</span> to create
            it and continue with migration.
          </p>
        </>
      )}
    </ConfirmDialog>
  );
}

interface BulkPushTargetPageDialogProps {
  open: boolean;
  missingCount: number;
  existingCount: number;
  totalTargetPages: number;
  missingPaths?: string[];
  existingPaths?: string[];
  isLoading?: boolean;
  progressItems?: TargetPageProgressItem[];
  progressPhase?: "creating" | "pushing" | "done";
  onContinue: () => void;
  onCancel: () => void;
}

export function BulkPushTargetPageDialog({
  open,
  missingCount,
  existingCount,
  totalTargetPages,
  missingPaths = [],
  existingPaths = [],
  isLoading,
  progressItems,
  progressPhase,
  onContinue,
  onCancel,
}: BulkPushTargetPageDialogProps) {
  const showProgress = Boolean(progressItems?.length && isLoading);

  return (
    <ConfirmDialog
      open={open}
      title={showProgress ? "Migration progress" : "Push to Sitecore"}
      confirmLabel="Continue push"
      onConfirm={onContinue}
      onCancel={onCancel}
      isLoading={isLoading && !showProgress}
      hideActions={showProgress}
      maxWidthClass={showProgress ? "max-w-lg" : "max-w-md"}
    >
      {showProgress && progressItems && progressPhase ? (
        <PagePushProgressList items={progressItems} phase={progressPhase} />
      ) : (
        <>
          <p>
            You are pushing components to{" "}
            <span className="font-semibold text-zinc-800">
              {totalTargetPages} target page
              {totalTargetPages === 1 ? "" : "s"}
            </span>
            .
          </p>
          <p className="mt-3">
            {existingCount > 0 && missingCount === 0
              ? "All target pages already exist in Sitecore. Content will be added or updated on those pages — no new pages will be created."
              : existingCount > 0
                ? "Existing pages will receive updated content. Only missing pages will be created."
                : "Missing pages will be created automatically. Each page name comes from the source URL (last path segment)."}
          </p>
          {existingCount > 0 && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <p className="font-semibold">
                {existingCount} existing page{existingCount === 1 ? "" : "s"} —
                content only
              </p>
              {existingPaths.length > 0 && (
                <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto font-mono">
                  {existingPaths.slice(0, 8).map((path) => (
                    <li key={path} className="break-all">
                      {path}
                    </li>
                  ))}
                  {existingPaths.length > 8 && (
                    <li>…and {existingPaths.length - 8} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
          {missingCount > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">
                {missingCount} page{missingCount === 1 ? "" : "s"} not found yet
              </p>
              {missingPaths.length > 0 && (
                <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto font-mono">
                  {missingPaths.slice(0, 8).map((path) => (
                    <li key={path} className="break-all">
                      {path}
                    </li>
                  ))}
                  {missingPaths.length > 8 && (
                    <li>…and {missingPaths.length - 8} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </ConfirmDialog>
  );
}
