"use client";

import type { ReactNode } from "react";
import { QueueItemCard } from "@/components/review/QueueItemCard";
import {
  reviewInputClass,
  reviewLabelClass,
  reviewSettingsPanelClass,
} from "@/components/review/form-styles";
import {
  DEFAULT_MIGRATION_LANGUAGE,
  DEFAULT_PRESENTATION_PLACEHOLDER,
} from "@/lib/migration/constants";
import type { MigrationQueueItem } from "@/types/migration-queue";

interface PageMigrationGroupProps {
  sourcePageUrl: string;
  pageTitle?: string;
  items: MigrationQueueItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
  onUpdatePageSettings: (
    sourcePageUrl: string,
    updates: Partial<
      Pick<MigrationQueueItem, "targetPagePath" | "placeholder" | "language">
    >,
  ) => void;
  onUpdateItem: (
    id: string,
    updates: Partial<
      Pick<MigrationQueueItem, "fields" | "datasourcePath">
    >,
  ) => void;
  onRemoveItem: (id: string) => void;
}

function PageGroupHeader({
  sourcePageUrl,
  pageTitle,
  items,
  readyCount,
  renderingSummary,
}: {
  sourcePageUrl: string;
  pageTitle?: string;
  items: MigrationQueueItem[];
  readyCount: number;
  renderingSummary: string[];
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Source page
        </p>
        {pageTitle && (
          <p className="mt-1 text-sm font-semibold text-zinc-900">{pageTitle}</p>
        )}
        <p className="mt-1 break-all font-mono text-sm text-zinc-800">
          {sourcePageUrl}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {items.length} component{items.length === 1 ? "" : "s"} — page settings
          apply to all components on this migration.
        </p>
        {renderingSummary.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {renderingSummary.map((name) => (
              <span
                key={name}
                className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-800"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
          {items.length} queued
        </span>
        {readyCount > 0 && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            {readyCount} ready
          </span>
        )}
      </div>
    </div>
  );
}

function PageGroupBody({
  lead,
  sourcePageUrl,
  targetPagePath,
  placeholder,
  language,
  items,
  onUpdatePageSettings,
  onUpdateItem,
  onRemoveItem,
}: {
  lead: MigrationQueueItem;
  sourcePageUrl: string;
  targetPagePath: string;
  placeholder: string;
  language: string;
  items: MigrationQueueItem[];
  onUpdatePageSettings: PageMigrationGroupProps["onUpdatePageSettings"];
  onUpdateItem: PageMigrationGroupProps["onUpdateItem"];
  onRemoveItem: PageMigrationGroupProps["onRemoveItem"];
}) {
  return (
    <>
      <div className={reviewSettingsPanelClass}>
        <p className="text-sm font-semibold text-zinc-900">Page migration settings</p>
        <p className="mt-1 text-xs text-zinc-600">
          Shared by all components on this source page.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <label
              htmlFor={`target-page-${lead.id}`}
              className={reviewLabelClass}
            >
              Target Sitecore page path
            </label>
            <input
              id={`target-page-${lead.id}`}
              type="text"
              value={targetPagePath}
              onChange={(event) =>
                onUpdatePageSettings(sourcePageUrl, {
                  targetPagePath: event.target.value,
                })
              }
              placeholder="/sitecore/content/YourSite/Home"
              className={reviewInputClass}
            />
          </div>
          <div>
            <label
              htmlFor={`placeholder-page-${lead.id}`}
              className={reviewLabelClass}
            >
              Presentation placeholder
            </label>
            <input
              id={`placeholder-page-${lead.id}`}
              type="text"
              value={placeholder}
              onChange={(event) =>
                onUpdatePageSettings(sourcePageUrl, {
                  placeholder: event.target.value,
                })
              }
              placeholder={DEFAULT_PRESENTATION_PLACEHOLDER}
              className={reviewInputClass}
            />
            <p className="mt-1.5 text-xs text-zinc-600">
              Enter the base placeholder key (for example{" "}
              <span className="font-mono font-medium text-zinc-800">
                headless-main
              </span>
              ). MigrateX resolves dynamic keys from the page layout at push
              time, including partial-design{" "}
              <span className="font-mono font-medium text-zinc-800">sig</span>{" "}
              placeholders.
            </p>
          </div>
          <div>
            <label
              htmlFor={`language-page-${lead.id}`}
              className={reviewLabelClass}
            >
              Language
            </label>
            <input
              id={`language-page-${lead.id}`}
              type="text"
              value={language}
              onChange={(event) =>
                onUpdatePageSettings(sourcePageUrl, {
                  language: event.target.value,
                })
              }
              placeholder="en"
              className={reviewInputClass}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {items.map((item) => (
          <QueueItemCard
            key={item.id}
            item={item}
            onUpdate={onUpdateItem}
            onRemove={onRemoveItem}
          />
        ))}
      </div>
    </>
  );
}

function wrapCollapsible(
  collapsible: boolean,
  defaultOpen: boolean,
  header: ReactNode,
  body: ReactNode,
): ReactNode {
  if (!collapsible) {
    return (
      <>
        <div className="border-b border-zinc-200 pb-4">{header}</div>
        {body}
      </>
    );
  }

  return (
    <details open={defaultOpen}>
      <summary className="cursor-pointer list-none border-b border-zinc-200 pb-4">
        {header}
      </summary>
      <div className="pt-5">{body}</div>
    </details>
  );
}

export function PageMigrationGroup({
  sourcePageUrl,
  pageTitle,
  items,
  collapsible = false,
  defaultOpen = true,
  onUpdatePageSettings,
  onUpdateItem,
  onRemoveItem,
}: PageMigrationGroupProps) {
  const lead = items[0]!;
  const targetPagePath = lead.targetPagePath;
  const placeholder = lead.placeholder ?? DEFAULT_PRESENTATION_PLACEHOLDER;
  const language = lead.language ?? DEFAULT_MIGRATION_LANGUAGE;
  const readyCount = items.filter((item) => item.targetPagePath.trim()).length;
  const renderingSummary = [
    ...new Set(items.map((item) => item.renderingName).filter(Boolean)),
  ];

  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
      {wrapCollapsible(
        collapsible,
        defaultOpen,
        <PageGroupHeader
          sourcePageUrl={sourcePageUrl}
          pageTitle={pageTitle}
          items={items}
          readyCount={readyCount}
          renderingSummary={renderingSummary}
        />,
        <PageGroupBody
          lead={lead}
          sourcePageUrl={sourcePageUrl}
          targetPagePath={targetPagePath}
          placeholder={placeholder}
          language={language}
          items={items}
          onUpdatePageSettings={onUpdatePageSettings}
          onUpdateItem={onUpdateItem}
          onRemoveItem={onRemoveItem}
        />,
      )}
    </section>
  );
}
