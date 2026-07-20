"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { LanguageMultiSelect } from "@/components/review/LanguageMultiSelect";
import { QueueItemCard } from "@/components/review/QueueItemCard";
import {
  reviewInputClass,
  reviewLabelClass,
  reviewSettingsPanelClass,
} from "@/components/review/form-styles";
import { DEFAULT_PRESENTATION_PLACEHOLDER } from "@/lib/migration/constants";
import {
  getFieldsForLanguage,
  isSameMigrationLanguage,
  resolvePrimarySourceLanguage,
} from "@/lib/migration/queue-language-fields";
import { resolveLocalizedSourceUrl } from "@/lib/migration/localized-source-url";
import { buildPageLanguagePicker } from "@/lib/migration/page-language-picker";
import { listPageRootPlaceholderKeys } from "@/lib/migration/placeholder-registry";
import { getCrawlResult, getDiscoveryResult } from "@/lib/storage/workflow-data";
import { getVisualMapperSourceLanguageCodes } from "@/lib/visual-mapper/source-page-languages";
import type { EditableFieldValue, MigrationQueueItem } from "@/types/migration-queue";

function fieldValuesMatch(
  left: EditableFieldValue[],
  right: EditableFieldValue[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((field, index) => field.value === right[index]?.value);
}

/** True when language fields still need a successful localized load. */
function needsLanguageFieldLoad(
  item: MigrationQueueItem,
  language: string,
  primaryLanguage: string,
): boolean {
  const cached = getFieldsForLanguage(item, language);
  if (!cached) {
    return true;
  }
  if (isSameMigrationLanguage(language, primaryLanguage)) {
    return false;
  }
  // Prior failed loads cached English values under the FR key — reload those.
  return fieldValuesMatch(cached, item.fields);
}

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
      Pick<
        MigrationQueueItem,
        "fields" | "fieldsByLanguage" | "datasourcePath" | "childPlaceholderKey"
      >
    >,
  ) => void;
  onRemoveItem: (id: string) => void;
}

interface LocalizedFieldsResponse {
  success: boolean;
  message?: string;
  language?: string;
  items?: Array<{
    id: string;
    language: string;
    fields: EditableFieldValue[];
    contentSourceUrl: string;
    localized: boolean;
    warning?: string;
  }>;
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

function seedPrimaryFieldsByLanguage(
  item: MigrationQueueItem,
): Record<string, EditableFieldValue[]> {
  const primary = resolvePrimarySourceLanguage(item);
  const existing = item.fieldsByLanguage ?? {};
  if (getFieldsForLanguage(item, primary)) {
    return existing;
  }
  return {
    ...existing,
    [primary]: item.fields.map((field) => ({ ...field })),
  };
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
  const primaryLanguage = resolvePrimarySourceLanguage(lead);
  const [editingLanguage, setEditingLanguage] = useState(
    () => selectedLanguages[0] ?? primaryLanguage,
  );
  const [loadingLanguage, setLoadingLanguage] = useState(false);
  const [languageFeedback, setLanguageFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (selectedLanguages.length === 0) {
      return;
    }
    if (!selectedLanguages.includes(editingLanguage)) {
      setEditingLanguage(selectedLanguages[0]!);
    }
  }, [selectedLanguages, editingLanguage]);

  const contentSourceUrl = useMemo(() => {
    return resolveLocalizedSourceUrl(sourcePageUrl, editingLanguage, {
      alternateUrls: lead.sourceAlternateUrls,
      primarySourceLanguage: primaryLanguage,
    });
  }, [
    sourcePageUrl,
    editingLanguage,
    lead.sourceAlternateUrls,
    primaryLanguage,
  ]);

  const ensureLanguageFieldsLoaded = useCallback(
    async (language: string) => {
      const needsLoad = items.some((item) =>
        needsLanguageFieldLoad(item, language, primaryLanguage),
      );

      console.info("[Review][Edit language] ensureLanguageFieldsLoaded", {
        language,
        primaryLanguage,
        needsLoad,
        itemCount: items.length,
        itemsMissingFields: items
          .filter((item) =>
            needsLanguageFieldLoad(item, language, primaryLanguage),
          )
          .map((item) => ({
            id: item.id,
            blockId: item.blockId,
            sourcePageUrl: item.sourcePageUrl,
            alternateUrls: item.sourceAlternateUrls,
            hadStaleCache: Boolean(getFieldsForLanguage(item, language)),
          })),
      });

      if (!needsLoad) {
        console.info(
          "[Review][Edit language] skipped — fields already loaded for",
          language,
        );
        return;
      }

      setLoadingLanguage(true);
      setLanguageFeedback(null);

      try {
        // Seed primary language from current fields without a network round-trip.
        if (isSameMigrationLanguage(language, primaryLanguage)) {
          console.info(
            "[Review][Edit language] seeding primary language fields locally",
            { language, primaryLanguage },
          );
          for (const item of items) {
            if (getFieldsForLanguage(item, language)) {
              continue;
            }
            onUpdateItem(item.id, {
              fieldsByLanguage: seedPrimaryFieldsByLanguage(item),
            });
          }
          return;
        }

        const crawlPages = getCrawlResult()?.pages ?? [];
        const requestBody = {
          language,
          items,
          sourcePages: crawlPages,
        };
        console.info("[Review][Edit language] POST /api/migration/localize-fields", {
          language,
          itemCount: items.length,
          crawlPageCount: crawlPages.length,
          crawlPageUrls: crawlPages.map((page) => page.url),
          sampleAlternates: items[0]?.sourceAlternateUrls,
          bodyApproxChars: JSON.stringify(requestBody).length,
        });

        let response: Response;
        try {
          response = await fetch("/api/migration/localize-fields", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          });
        } catch (networkError) {
          console.error(
            "[Review][Edit language] browser fetch threw (often shown as Failed to fetch)",
            {
              language,
              error:
                networkError instanceof Error
                  ? {
                      name: networkError.name,
                      message: networkError.message,
                      cause: (networkError as Error & { cause?: unknown }).cause,
                      stack: networkError.stack,
                    }
                  : networkError,
            },
          );
          throw networkError;
        }

        console.info("[Review][Edit language] API response status", {
          language,
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
        });

        let payload: LocalizedFieldsResponse;
        try {
          payload = (await response.json()) as LocalizedFieldsResponse;
        } catch (parseError) {
          console.error(
            "[Review][Edit language] failed to parse API JSON response",
            {
              language,
              status: response.status,
              parseError,
            },
          );
          throw parseError;
        }

        console.info("[Review][Edit language] API payload", {
          language,
          success: payload.success,
          message: payload.message,
          itemCount: payload.items?.length,
          warnings: payload.items
            ?.map((entry) => entry.warning)
            .filter(Boolean),
          contentSourceUrls: payload.items?.map((entry) => ({
            id: entry.id,
            contentSourceUrl: entry.contentSourceUrl,
            localized: entry.localized,
          })),
        });

        if (!response.ok || !payload.success || !payload.items) {
          setLanguageFeedback(
            payload.message || "Failed to load content for this language.",
          );
          console.error(
            "[Review][Edit language] localize-fields returned failure",
            {
              language,
              status: response.status,
              payload,
            },
          );
          return;
        }

        const warnings: string[] = [];
        for (const localized of payload.items) {
          const item = items.find((entry) => entry.id === localized.id);
          if (!item) {
            continue;
          }
          if (localized.warning) {
            warnings.push(localized.warning);
          }

          // Only persist successfully localized content — avoid caching EN under FR.
          if (!localized.localized) {
            console.warn(
              "[Review][Edit language] skipping cache for non-localized result",
              {
                id: localized.id,
                language,
                warning: localized.warning,
              },
            );
            continue;
          }

          const nextByLanguage = {
            ...(item.fieldsByLanguage ?? {}),
            [language]: localized.fields,
          };

          onUpdateItem(item.id, {
            fieldsByLanguage: nextByLanguage,
          });
        }

        if (warnings.length > 0) {
          console.warn(
            "[Review][Edit language] localization warnings",
            warnings,
          );
          setLanguageFeedback(warnings[0] ?? null);
        } else {
          console.info(
            "[Review][Edit language] loaded fields successfully for",
            language,
          );
        }
      } catch (error) {
        console.error("[Review][Edit language] ensureLanguageFieldsLoaded failed", {
          language,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  cause: (error as Error & { cause?: unknown }).cause,
                  stack: error.stack,
                }
              : error,
        });
        setLanguageFeedback(
          error instanceof Error
            ? error.message
            : "Failed to load content for this language.",
        );
      } finally {
        setLoadingLanguage(false);
      }
    },
    [items, onUpdateItem, primaryLanguage],
  );

  useEffect(() => {
    void ensureLanguageFieldsLoaded(editingLanguage);
  }, [editingLanguage, ensureLanguageFieldsLoaded]);

  async function handleEditingLanguageChange(language: string) {
    setEditingLanguage(language);
    await ensureLanguageFieldsLoaded(language);
  }

  function handleItemFieldsUpdate(
    id: string,
    fields: EditableFieldValue[],
  ): void {
    const item = items.find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    const nextByLanguage = {
      ...(item.fieldsByLanguage ?? {}),
      [editingLanguage]: fields,
    };

    // Keep top-level fields in sync when editing the primary source language.
    if (isSameMigrationLanguage(editingLanguage, primaryLanguage)) {
      onUpdateItem(id, {
        fields,
        fieldsByLanguage: nextByLanguage,
      });
      return;
    }

    onUpdateItem(id, {
      fieldsByLanguage: nextByLanguage,
    });
  }

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
          {selectedLanguages.length > 0 && (
            <div className="md:col-span-3">
              <p className={reviewLabelClass}>Edit content for language</p>
              <div
                role="radiogroup"
                aria-label="Edit content language"
                className="mt-1.5 flex flex-wrap gap-1.5"
              >
                {selectedLanguages.map((language) => {
                  const isActive = language === editingLanguage;
                  const isSource = isSameMigrationLanguage(
                    language,
                    primaryLanguage,
                  );
                  return (
                    <button
                      key={language}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      id={`edit-language-${lead.id}-${language}`}
                      disabled={loadingLanguage && !isActive}
                      onClick={() => {
                        void handleEditingLanguageChange(language);
                      }}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs font-semibold transition-colors ${
                        isActive
                          ? "border-brand bg-brand text-white"
                          : "border-line bg-surface text-slate-700 hover:border-brand/30 hover:bg-brand-soft hover:text-brand-dark"
                      } disabled:cursor-wait disabled:opacity-70`}
                    >
                      {language}
                      {isSource ? (
                        <span
                          className={`text-[9px] font-semibold uppercase tracking-wide ${
                            isActive ? "text-white/80" : "text-slate-400"
                          }`}
                        >
                          src
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-zinc-600">
                {loadingLanguage
                  ? `Loading ${editingLanguage} content…`
                  : `Editing ${editingLanguage} field values (including CTAs).`}
                {contentSourceUrl !== sourcePageUrl ? (
                  <>
                    {" "}
                    <span className="break-all font-mono text-zinc-500">
                      {contentSourceUrl}
                    </span>
                  </>
                ) : null}
              </p>
              {languageFeedback && (
                <p className="mt-1 text-xs text-amber-700">{languageFeedback}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {sortedItems.map((item) => {
          const languageFields =
            getFieldsForLanguage(item, editingLanguage) ?? item.fields;

          return (
            <div
              key={item.id}
              style={{
                marginLeft: `${Math.min(item.presentationDepth ?? 0, 4) * 1.25}rem`,
              }}
            >
              <QueueItemCard
                item={{
                  ...item,
                  fields: languageFields,
                }}
                pageItems={items}
                contentSourceUrl={contentSourceUrl}
                editingLanguage={editingLanguage}
                onUpdate={(id, updates) => {
                  if (updates.fields) {
                    handleItemFieldsUpdate(id, updates.fields);
                    const rest = { ...updates };
                    delete rest.fields;
                    if (Object.keys(rest).length > 0) {
                      onUpdateItem(id, rest);
                    }
                    return;
                  }
                  onUpdateItem(id, updates);
                }}
                onRemove={onRemoveItem}
              />
            </div>
          );
        })}
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
