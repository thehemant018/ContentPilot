"use client";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface MissingTargetPageDialogProps {
  open: boolean;
  targetPagePath: string;
  isLoading?: boolean;
  onCreatePage: () => void;
  onCancel: () => void;
}

export function MissingTargetPageDialog({
  open,
  targetPagePath,
  isLoading,
  onCreatePage,
  onCancel,
}: MissingTargetPageDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Target page not found in Sitecore"
      confirmLabel="Create page"
      onConfirm={onCreatePage}
      onCancel={onCancel}
      isLoading={isLoading}
    >
      <p>
        The target page you defined does not exist in Sitecore yet:
      </p>
      <p className="mt-2 break-all rounded-lg bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800">
        {targetPagePath}
      </p>
      <p className="mt-3">
        Click <span className="font-semibold">Create page</span> to create it
        and continue with migration.
      </p>
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
  onContinue,
  onCancel,
}: BulkPushTargetPageDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Push to Sitecore"
      confirmLabel="Continue push"
      onConfirm={onContinue}
      onCancel={onCancel}
      isLoading={isLoading}
    >
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
            {existingCount} existing page{existingCount === 1 ? "" : "s"} — content
            only
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
    </ConfirmDialog>
  );
}
