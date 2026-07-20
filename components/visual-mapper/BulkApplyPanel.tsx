"use client";

import { useState } from "react";
import {
  visualMapperInputClass,
  visualMapperInputMonoClass,
} from "@/components/visual-mapper/form-styles";
import {
  appendBulkApplyToMigrationQueue,
  type BulkQueuePageInput,
} from "@/lib/visual-mapper/run-migration";
import { saveVisualMapperSourceLanguages } from "@/lib/visual-mapper/source-page-languages";
import type { SourcePageLanguage } from "@/types/language";
import type { BulkApplyPageResult, MappingEntry } from "@/types/visual-mapper";
import {
  advanceToWorkflowPhase,
  markAiMatchPhaseComplete,
  markCrawlPhaseComplete,
  markMapModePhaseComplete,
} from "@/lib/workflow/progress";
import { saveMigrationMode } from "@/lib/workflow/migration-mode";

interface BulkApplyPanelProps {
  mappings: MappingEntry[];
  templatePageUrl: string;
  defaultTargetPagePath: string;
  /** Sitecore languages selected for the mapped template page. */
  selectedLanguages?: string[];
  /** Languages detected on the template page. */
  templateLanguages?: SourcePageLanguage | null;
}

function parseUrlLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function languageSummary(languages?: SourcePageLanguage | null): string {
  if (!languages) {
    return "";
  }
  const codes = [
    ...(languages.detectedLanguage ? [languages.detectedLanguage] : []),
    ...languages.availableLanguages,
  ].filter((code, index, all) => all.indexOf(code) === index);
  return codes.join(", ");
}

function buildPagesFromResults(
  results: BulkApplyPageResult[],
  defaultTargetPagePath: string,
  selectedLanguages: string[],
): BulkQueuePageInput[] {
  return results
    .filter(
      (item) => item.mappings.length > 0 && item.status !== "failed",
    )
    .map((item) => ({
      mappings: item.mappings,
      pageUrl: item.url,
      pageTitle: item.pageTitle || item.url,
      targetPagePath: item.targetPagePath || defaultTargetPagePath.trim(),
      selectedLanguages,
      languages: item.languages ?? null,
    }));
}

export function BulkApplyPanel({
  mappings,
  templatePageUrl,
  defaultTargetPagePath,
  selectedLanguages = [],
  templateLanguages = null,
}: BulkApplyPanelProps) {
  const [urlList, setUrlList] = useState("");
  const [targetPathPattern, setTargetPathPattern] = useState(
    defaultTargetPagePath.includes("{")
      ? defaultTargetPagePath
      : defaultTargetPagePath
        ? defaultTargetPagePath.replace(/\/{slug\}$/i, "")
        : "",
  );
  const [isApplying, setIsApplying] = useState(false);
  const [bulkApplyEnabled, setBulkApplyEnabled] = useState(false);
  const [results, setResults] = useState<BulkApplyPageResult[] | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  const fieldCount = mappings.reduce(
    (sum, entry) => sum + entry.fieldAssignments.length,
    0,
  );

  const hasTargetPattern = targetPathPattern.trim().length > 0;
  const templateLanguageLabel =
    selectedLanguages.length > 0
      ? selectedLanguages.join(", ")
      : languageSummary(templateLanguages);

  const readyResults =
    results?.filter(
      (item) => item.mappings.length > 0 && item.status !== "failed",
    ) ?? [];

  async function applyTemplateToUrls(
    urls: string[],
  ): Promise<BulkApplyPageResult[] | null> {
    const response = await fetch("/api/visual-mapper/apply-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templatePageUrl,
        mappings,
        urls,
        targetPagePathPattern: targetPathPattern.trim(),
        selectedLanguages,
        languages: templateLanguages ?? undefined,
      }),
    });

    const payload = (await response.json()) as {
      error?: string;
      results?: BulkApplyPageResult[];
    };

    if (!response.ok) {
      setFeedback({
        type: "error",
        message: payload.error ?? "Failed to apply template.",
      });
      return null;
    }

    const pageResults = payload.results ?? [];

    // Persist per-page detection so Review language lookup works for bulk URLs.
    for (const item of pageResults) {
      if (item.languages) {
        saveVisualMapperSourceLanguages(item.url, item.languages);
      }
    }

    setResults(pageResults);
    return pageResults;
  }

  async function handleApply() {
    const urls = parseUrlLines(urlList);

    if (urls.length === 0) {
      setFeedback({ type: "error", message: "Enter at least one page URL." });
      return;
    }

    if (!hasTargetPattern) {
      setFeedback({
        type: "error",
        message: "Enter a target folder path (page names come from each URL).",
      });
      return;
    }

    setIsApplying(true);
    setFeedback(null);
    setResults(null);

    try {
      const pageResults = await applyTemplateToUrls(urls);
      if (!pageResults) {
        return;
      }

      const ok = pageResults.filter((item) => item.status === "ok").length;
      const partial = pageResults.filter((item) => item.status === "partial")
        .length;
      const failed = pageResults.filter((item) => item.status === "failed")
        .length;
      const withLangs = pageResults.filter(
        (item) =>
          item.languages &&
          (item.languages.detectedLanguage ||
            item.languages.availableLanguages.length > 0),
      ).length;

      setFeedback({
        type: failed > 0 ? "warning" : "success",
        message: `Applied to ${pageResults.length} page(s): ${ok} ready, ${partial} partial, ${failed} failed${
          withLangs > 0 ? `; languages detected on ${withLangs}` : ""
        }. Review target paths below or send to Review.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to apply template.",
      });
    } finally {
      setIsApplying(false);
    }
  }

  function handleAddToReview() {
    if (!results?.length) {
      return;
    }

    const pages = buildPagesFromResults(
      results,
      defaultTargetPagePath,
      selectedLanguages,
    );
    if (pages.length === 0) {
      setFeedback({
        type: "error",
        message: "No successful pages to add. Fix failures and try again.",
      });
      return;
    }

    const { added, skipped } = appendBulkApplyToMigrationQueue(pages);

    saveMigrationMode("visual-mapper");
    markMapModePhaseComplete();
    markCrawlPhaseComplete();
    markAiMatchPhaseComplete();
    advanceToWorkflowPhase("review");
    window.location.href = "/#review";

    if (skipped > 0 && added === 0) {
      setFeedback({
        type: "warning",
        message: `${skipped} component(s) were already in Review. Opening Review...`,
      });
      return;
    }

    setFeedback({
      type: "success",
      message:
        skipped > 0
          ? `Added ${added} component(s) to Review (${skipped} already queued). Edit page names/paths in Review, then push.`
          : `Added ${added} component(s) to Review. Edit page names/paths there if needed, then push.`,
    });
  }

  return (
    <section className="border-t border-zinc-200 p-4">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={bulkApplyEnabled}
          onChange={(event) => setBulkApplyEnabled(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
        />
        <span>
          <span className="text-sm font-semibold text-zinc-900">
            Apply mapping to more pages
          </span>
          <p className="mt-0.5 text-xs text-zinc-500">
            Reuse the {mappings.length} component
            {mappings.length === 1 ? "" : "s"} and {fieldCount} field mapping
            {fieldCount === 1 ? "" : "s"} on similar URLs (e.g. other blog
            posts).
          </p>
        </span>
      </label>

      {bulkApplyEnabled && (
        <div className="mt-4 space-y-3 border-l-2 border-teal-200 pl-4">
          {templateLanguageLabel ? (
            <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-900">
              Languages from mapping:{" "}
              <span className="font-semibold">{templateLanguageLabel}</span>
              . These Sitecore language versions will be applied to all listed
              pages; each page also gets its own detected locale URLs.
            </p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No languages detected on the mapped page yet. Bulk pages will
              still detect their own languages when applied; load the source
              page first for Sitecore language matching.
            </p>
          )}

          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Page URLs (one per line)
          </label>
          <textarea
            value={urlList}
            onChange={(event) => setUrlList(event.target.value)}
            rows={5}
            placeholder={
              "https://example.com/blog/post-two\nhttps://example.com/blog/post-three"
            }
            className={`mt-1.5 w-full resize-y ${visualMapperInputClass}`}
          />

          <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Target folder path
          </label>
          <input
            type="text"
            value={targetPathPattern}
            onChange={(event) => setTargetPathPattern(event.target.value)}
            placeholder="/sitecore/content/Site/Home/Blogs"
            className={`mt-1.5 w-full ${visualMapperInputMonoClass}`}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Parent folder in Sitecore. Page names come from each URL (last
            segment). Edit names and paths in Review before pushing.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={isApplying || mappings.length === 0}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isApplying ? "Applying..." : "Apply template"}
            </button>

            {readyResults.length > 0 && (
              <button
                type="button"
                onClick={handleAddToReview}
                disabled={isApplying}
                className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
              >
                Review {readyResults.length} page
                {readyResults.length === 1 ? "" : "s"}
              </button>
            )}
          </div>

          {feedback && (
            <p
              className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800"
                  : feedback.type === "warning"
                    ? "bg-amber-50 text-amber-900"
                    : "bg-rose-50 text-rose-800"
              }`}
            >
              {feedback.message}
            </p>
          )}

          {results && results.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                    <th className="px-2 py-2 font-semibold">URL</th>
                    <th className="px-2 py-2 font-semibold">Page name</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                    <th className="px-2 py-2 font-semibold">Languages</th>
                    <th className="px-2 py-2 font-semibold">Components</th>
                    <th className="px-2 py-2 font-semibold">Target path</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((item) => (
                    <tr
                      key={item.url}
                      className="border-b border-zinc-100 align-top"
                    >
                      <td className="max-w-40 truncate px-2 py-2 font-mono text-zinc-700">
                        {item.url}
                      </td>
                      <td className="px-2 py-2 font-medium text-zinc-800">
                        {item.pageName || "-"}
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={item.status} />
                        {item.error && (
                          <p className="mt-1 text-rose-600">{item.error}</p>
                        )}
                        {item.missingFields.length > 0 && (
                          <p className="mt-1 text-amber-700">
                            Missing: {item.missingFields.join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-zinc-600">
                        {languageSummary(item.languages) || "-"}
                      </td>
                      <td className="px-2 py-2 text-zinc-600">
                        {item.mappings.length}
                      </td>
                      <td className="max-w-44 truncate px-2 py-2 font-mono text-zinc-600">
                        {item.targetPagePath || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatusBadge({
  status,
}: {
  status: BulkApplyPageResult["status"];
}) {
  const styles =
    status === "ok"
      ? "bg-emerald-100 text-emerald-800"
      : status === "partial"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${styles}`}
    >
      {status}
    </span>
  );
}
