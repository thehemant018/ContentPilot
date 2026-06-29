"use client";

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
  items: MigrationQueueItem[];
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

export function PageMigrationGroup({
  sourcePageUrl,
  items,
  onUpdatePageSettings,
  onUpdateItem,
  onRemoveItem,
}: PageMigrationGroupProps) {
  const lead = items[0]!;
  const targetPagePath = lead.targetPagePath;
  const placeholder = lead.placeholder ?? DEFAULT_PRESENTATION_PLACEHOLDER;
  const language = lead.language ?? DEFAULT_MIGRATION_LANGUAGE;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
      <div className="border-b border-zinc-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Source page
        </p>
        <p className="mt-1 break-all font-mono text-sm text-zinc-800">
          {sourcePageUrl}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {items.length} component{items.length === 1 ? "" : "s"} — page
          settings below apply to all components on this migration.
        </p>
      </div>

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
    </section>
  );
}
