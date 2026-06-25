"use client";

import { useEffect, useState } from "react";
import { CrawlResults } from "@/components/crawl/CrawlResults";
import { NextPhaseButton } from "@/components/workflow/NextPhaseButton";
import { isDiscoveryPhaseComplete, markCrawlPhaseComplete } from "@/lib/workflow/progress";
import { saveCrawlResult } from "@/lib/storage/workflow-data";
import type { CrawlMode, CrawlResult } from "@/types/crawl";

export function CrawlPanel({ embedded = false }: { embedded?: boolean }) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [mode, setMode] = useState<CrawlMode>("single");
  const [maxPages, setMaxPages] = useState(10);
  const [isCrawling, setIsCrawling] = useState(false);
  const [discoveryComplete, setDiscoveryComplete] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [result, setResult] = useState<CrawlResult | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setDiscoveryComplete(isDiscoveryPhaseComplete());
    });
  }, []);

  async function handleCrawl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setResult(null);
    setIsCrawling(true);

    try {
      const response = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sourceUrl,
          mode,
          maxPages: mode === "site" ? maxPages : undefined,
        }),
      });

      const payload = (await response.json()) as CrawlResult;

      if (!response.ok || !payload.success) {
        setFeedback({
          type: "error",
          message: payload.message ?? "Crawl failed.",
        });
        return;
      }

      setResult(payload);
      markCrawlPhaseComplete();
      saveCrawlResult(payload);
      setFeedback({
        type: "success",
        message: payload.message,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Crawl request failed.",
      });
    } finally {
      setIsCrawling(false);
    }
  }

  if (!discoveryComplete) {
    return (
      <div
        className={
          embedded
            ? "rounded-xl border border-amber-200 bg-amber-50 p-5"
            : "mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6"
        }
      >
        <h3 className="text-lg font-semibold text-amber-900">
          Complete Discovery first
        </h3>
        <p className="mt-2 text-sm text-amber-800">
          Phase 3 crawls your source site after Sitecore discovery is finished.
          Go back to the Discovery tab and run path validation first.
        </p>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-4xl space-y-6"}>
      <div>
        <h3 className="text-lg font-semibold text-zinc-900">
          Source URL crawl
        </h3>
        <p className="mt-1 text-sm text-zinc-600">
          Paste a page URL or domain root. We fetch the HTML and detect semantic
          content blocks such as heroes, card grids, media, CTAs, and rich text.
          Headers, footers, navigation, and ads are excluded from the crawl JSON.
          JavaScript-rendered pages may need a browser-based crawler later.
        </p>
      </div>

      <form
        onSubmit={handleCrawl}
        className="space-y-5 rounded-xl border border-zinc-200 bg-zinc-50 p-5"
      >
        <div>
          <label
            htmlFor="source-url"
            className="block text-sm font-medium text-zinc-700"
          >
            Source URL
          </label>
          <input
            id="source-url"
            type="url"
            required
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://example.com or https://example.com/about"
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500 focus:border-blue-500 focus:ring-2"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-zinc-700">
            Crawl mode
          </legend>
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="crawl-mode"
                value="single"
                checked={mode === "single"}
                onChange={() => setMode("single")}
              />
              Single page
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="crawl-mode"
                value="site"
                checked={mode === "site"}
                onChange={() => setMode("site")}
              />
              Full site (same domain)
            </label>
          </div>
        </fieldset>

        {mode === "site" && (
          <div>
            <label
              htmlFor="max-pages"
              className="block text-sm font-medium text-zinc-700"
            >
              Max pages
            </label>
            <input
              id="max-pages"
              type="number"
              min={1}
              max={50}
              value={maxPages}
              onChange={(event) =>
                setMaxPages(Number.parseInt(event.target.value, 10) || 10)
              }
              className="mt-1.5 w-32 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-500 focus:border-blue-500 focus:ring-2"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Breadth-first crawl, same domain only (max 50).
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={isCrawling || !sourceUrl.trim()}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCrawling ? "Crawling…" : "Start crawl"}
        </button>
      </form>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {result?.success && <CrawlResults result={result} />}

      {result?.success && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-6">
          <p className="text-sm text-zinc-600">
            Crawl complete. Continue to match blocks with Sitecore components.
          </p>
          <NextPhaseButton
            currentPhaseId="crawl"
            className="bg-blue-600 hover:bg-blue-700"
          />
        </div>
      )}
    </div>
  );
}
