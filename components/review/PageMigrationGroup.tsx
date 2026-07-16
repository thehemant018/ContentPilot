"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { LanguageMultiSelect } from "@/components/review/LanguageMultiSelect";
import { QueueItemCard } from "@/components/review/QueueItemCard";
import {
  reviewInputClass,
  reviewLabelClass,
  reviewSettingsPanelClass,
} from "@/components/review/form-styles";
import { DEFAULT_PRESENTATION_PLACEHOLDER } from "@/lib/migration/constants";
import { buildPageLanguagePicker } from "@/lib/migration/page-language-picker";
import { listPageRootPlaceholderKeys } from "@/lib/migration/placeholder-registry";
import { getCrawlResult, getDiscoveryResult } from "@/lib/storage/workflow-data";
import { getVisualMapperSourceLanguageCodes } from "@/lib/visual-mapper/source-page-languages";
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
      Pick<
        MigrationQueueItem,
        "targetPagePath" | "placeholder" | "language" | "languages"
      >
    >,
  ) => void;
  onUpdateItem: (
    id: string,
    updates: Partial<
      Pick<MigrationQueueItem, "fields" | "datasourcePath" | "childPlaceholderKey">
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
  selectedLanguages,
}: {
  sourcePageUrl: string;
  pageTitle?: string;
  items: MigrationQueueItem[];
  readyCount: number;
  renderingSummary: string[];
  selectedLanguages: string[];
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
        {selectedLanguages.length > 0 && (
          <p className="mt-1 text-xs text-zinc-600">
            Versions: {selectedLanguages.join(", ")}
          </p>
        )}
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
  selectedLanguages,
  languageOptions,
  items,
  pagePlaceholderKeys,
  onUpdatePageSettings,
  onUpdateItem,
  onRemoveItem,
}: {
  lead: MigrationQueueItem;
  sourcePageUrl: string;
  targetPagePath: string;
  placeholder: string;
  selectedLanguages: string[];
  languageOptions: ReturnType<typeof buildPageLanguagePicker>["options"];
  items: MigrationQueueItem[];
  pagePlaceholderKeys: string[];
  onUpdatePageSettings: PageMigrationGroupProps["onUpdatePageSettings"];
  onUpdateItem: PageMigrationGroupProps["onUpdateItem"];
  onRemoveItem: PageMigrationGroupProps["onRemoveItem"];
}) {
  const sortedItems = [...items].sort((left, right) => {
    const leftDepth = left.presentationDepth ?? 0;
    const rightDepth = right.presentationDepth ?? 0;
    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }
    const leftSibling = left.presentationSiblingIndex ?? 0;
    const rightSibling = right.presentationSiblingIndex ?? 0;
    return leftSibling - rightSibling;
  });

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
              Main placeholder
            </label>
            <input
              id={`placeholder-page-${lead.id}`}
              type="text"
              list={`placeholder-suggestions-${lead.id}`}
              value={placeholder}
              onChange={(event) =>
                onUpdatePageSettings(sourcePageUrl, {
                  placeholder: event.target.value,
                })
              }
              placeholder={DEFAULT_PRESENTATION_PLACEHOLDER}
              className={reviewInputClass}
            />
            <datalist id={`placeholder-suggestions-${lead.id}`}>
              {pagePlaceholderKeys.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
            <p className="mt-1.5 text-xs text-zinc-600">
              Root placeholder for page-level components (default{" "}
              {DEFAULT_PRESENTATION_PLACEHOLDER}). Edit if your layout uses a
              different key. Nested children use parent exposed placeholders
              automatically.
            </p>
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor={`language-page-${lead.id}`}
              className={reviewLabelClass}
            >
              Sitecore language versions
            </label>
            <LanguageMultiSelect
              id={`language-page-${lead.id}`}
              options={languageOptions}
              selected={selectedLanguages}
              onChange={(languages) =>
                onUpdatePageSettings(sourcePageUrl, {
                  languages,
                  language: languages[0],
                })
              }
            />
            <p className="mt-1.5 text-xs text-zinc-600">
              Select one or more matched languages. Unmatched Sitecore languages
              are shown disabled. Missing page/datasource versions are created on
              push.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {sortedItems.map((item) => (
          <div
            key={item.id}
            style={{
              marginLeft: `${Math.min(item.presentationDepth ?? 0, 4) * 1.25}rem`,
            }}
          >
            <QueueItemCard
              item={item}
              pageItems={items}
              onUpdate={onUpdateItem}
              onRemove={onRemoveItem}
            />
          </div>
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
  const readyCount = items.filter((item) => item.targetPagePath.trim()).length;
  const renderingSummary = [
    ...new Set(items.map((item) => item.renderingName).filter(Boolean)),
  ];
  const pagePlaceholderKeys = useMemo(() => {
    const discovery = getDiscoveryResult();
    const discovered = listPageRootPlaceholderKeys(discovery?.placeholders).filter(
      (key) => !key.includes("{") && !key.includes("/"),
    );
    return [
      ...new Set([
        DEFAULT_PRESENTATION_PLACEHOLDER,
        ...discovered,
        placeholder.trim(),
      ]),
    ]
      .filter(Boolean)
      .sort();
  }, [placeholder]);

  const crawl = getCrawlResult();
  const languagePicker = useMemo(() => {
    const alternateSourceCodes = Object.keys(lead.sourceAlternateUrls ?? {});
    const visualMapperCodes = getVisualMapperSourceLanguageCodes(sourcePageUrl);

    return buildPageLanguagePicker(
      sourcePageUrl,
      getDiscoveryResult(),
      lead.languages ?? (lead.language ? [lead.language] : []),
      crawl?.pages,
      crawl?.sourceLanguages,
      [...visualMapperCodes, ...alternateSourceCodes],
    );
  }, [
    sourcePageUrl,
    lead.languages,
    lead.language,
    lead.sourceAlternateUrls,
    crawl?.pages,
    crawl?.sourceLanguages,
  ]);

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
          selectedLanguages={languagePicker.selected}
        />,
        <PageGroupBody
          lead={lead}
          sourcePageUrl={sourcePageUrl}
          targetPagePath={targetPagePath}
          placeholder={placeholder}
          selectedLanguages={languagePicker.selected}
          languageOptions={languagePicker.options}
          items={items}
          pagePlaceholderKeys={pagePlaceholderKeys}
          onUpdatePageSettings={onUpdatePageSettings}
          onUpdateItem={onUpdateItem}
          onRemoveItem={onRemoveItem}
        />,
      )}
    </section>
  );
}
