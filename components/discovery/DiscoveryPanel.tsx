"use client";

import { useEffect, useState } from "react";
import { SESSION_CHANGED_EVENT } from "@/lib/sitecore/constants";
import { sitecoreApiFetch } from "@/lib/sitecore/api-client";
import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";
import type { DiscoveryResult, SitecoreSite } from "@/types/discovery";
import { DiscoveryResults } from "@/components/discovery/DiscoveryResults";
import { SiteSelector } from "@/components/discovery/SiteSelector";
import { NextPhaseButton } from "@/components/workflow/NextPhaseButton";
import { markDiscoveryPhaseComplete } from "@/lib/workflow/progress";
import { saveDiscoveryResult, getDiscoveryResult } from "@/lib/storage/workflow-data";
import { DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH } from "@/lib/migration/sxa-page-structure";
import { saveVisualMapperSiteId } from "@/lib/visual-mapper/session-storage";

const DEFAULT_RENDERINGS_PATH = "/sitecore/layout/Renderings";
const DEFAULT_MEDIA_PATH = "/sitecore/media";
const DEFAULT_TEMPLATES_PATH = "/sitecore/templates";

export function DiscoveryPanel({ embedded = false }: { embedded?: boolean }) {
  const [isConnected, setIsConnected] = useState(false);
  const [sites, setSites] = useState<SitecoreSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<SitecoreSite | null>(null);
  const [renderingsPath, setRenderingsPath] = useState(DEFAULT_RENDERINGS_PATH);
  const [mediaPath, setMediaPath] = useState(DEFAULT_MEDIA_PATH);
  const [templatesPath, setTemplatesPath] = useState(DEFAULT_TEMPLATES_PATH);
  const [pageTemplatePath, setPageTemplatePath] = useState("");
  const [sxaPageDataTemplatePath, setSxaPageDataTemplatePath] = useState(
    DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH,
  );
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  function refreshConnectionState() {
    const session = getStoredSession();
    setIsConnected(Boolean(session && !isSessionExpired(session)));
  }

  async function loadSites() {
    setIsLoadingSites(true);
    setFeedback(null);

    try {
      const response = await sitecoreApiFetch("/api/sitecore/sites");
      const payload = (await response.json()) as {
        success: boolean;
        message?: string;
        sites?: SitecoreSite[];
      };

      if (!response.ok || !payload.success || !payload.sites) {
        setFeedback({
          type: "error",
          message: payload.message ?? "Failed to load sites.",
        });
        setSites([]);
        return;
      }

      setSites(payload.sites);
      if (payload.sites.length === 1) {
        setSelectedSite(payload.sites[0]);
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to load sites.",
      });
      setSites([]);
    } finally {
      setIsLoadingSites(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      refreshConnectionState();
      const saved = getDiscoveryResult();
      if (saved?.pageTemplatePath) {
        setPageTemplatePath(saved.pageTemplatePath);
      }
      if (saved?.sxaPageDataTemplatePath) {
        setSxaPageDataTemplatePath(saved.sxaPageDataTemplatePath);
      }
    });

    function handleSessionChange() {
      refreshConnectionState();
      setSites([]);
      setSelectedSite(null);
      setResult(null);
      setFeedback(null);
    }

    window.addEventListener(SESSION_CHANGED_EVENT, handleSessionChange);
    return () =>
      window.removeEventListener(SESSION_CHANGED_EVENT, handleSessionChange);
  }, []);

  useEffect(() => {
    if (isConnected) {
      queueMicrotask(() => {
        void loadSites();
      });
    }
  }, [isConnected]);

  async function handleDiscover(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setResult(null);

    if (!selectedSite) {
      setFeedback({
        type: "error",
        message: "Select a site before running discovery.",
      });
      return;
    }

    setIsDiscovering(true);

    try {
      const response = await sitecoreApiFetch("/api/sitecore/discovery", {
        method: "POST",
        body: JSON.stringify({
          siteName: selectedSite.name,
          renderingsPath,
          mediaPath,
          templatesPath,
        }),
      });

      const payload = (await response.json()) as DiscoveryResult;
      setResult(payload);

      setFeedback({
        type: payload.success ? "success" : "error",
        message: payload.message,
      });

      if (payload.success) {
        markDiscoveryPhaseComplete();
        saveDiscoveryResult({
          ...payload,
          pageTemplatePath: pageTemplatePath.trim() || undefined,
          sxaPageDataTemplatePath: sxaPageDataTemplatePath.trim() || undefined,
        });
        if (selectedSite) {
          saveVisualMapperSiteId(selectedSite.name);
        }
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Discovery request failed.",
      });
    } finally {
      setIsDiscovering(false);
    }
  }

  const wrapperClass = embedded
    ? "w-full"
    : "w-full scroll-mt-24 rounded-2xl border p-6 shadow-sm ring-1";

  if (!isConnected) {
    return (
      <div
        id={embedded ? undefined : "discovery"}
        className={
          embedded
            ? "w-full"
            : `${wrapperClass} border-zinc-200 bg-zinc-50`
        }
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">
          Phase 2 — Discovery
        </p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-900">
          Site &amp; template discovery
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          Connect to Sitecore XM Cloud in the{" "}
          <button
            type="button"
            onClick={() => {
              window.location.hash = "auth";
            }}
            className="font-medium text-violet-600 underline-offset-2 hover:underline"
          >
            Auth tab
          </button>{" "}
          to list sites and discover renderings, media, and templates.
        </p>
      </div>
    );
  }

  return (
    <div
      id={embedded ? undefined : "discovery"}
      className={
        embedded
          ? "w-full"
          : `${wrapperClass} border-teal-200 bg-white ring-teal-100`
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">
            Phase 2 — Discovery
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-900">
            Site &amp; template discovery
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
            Select a site, then provide the renderings, media, and templates
            paths for MigrateX to verify. When all paths exist, we load the
            target schema — read-only, nothing is modified in Sitecore.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSites()}
          disabled={isLoadingSites}
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 disabled:opacity-60"
        >
          {isLoadingSites ? "Refreshing…" : "Refresh sites"}
        </button>
      </div>

      <div className="mt-8 space-y-8">
        <SiteSelector
          sites={sites}
          selectedSite={selectedSite}
          isLoading={isLoadingSites}
          onSelect={setSelectedSite}
        />

        <form onSubmit={handleDiscover} className="space-y-4">
          <h3 className="text-sm font-semibold text-zinc-900">
            Portal paths to validate
          </h3>
          <p className="text-sm text-zinc-600">
            Enter the Sitecore item paths where your project keeps renderings,
            media, and templates. We check each path exists before loading
            related items.
          </p>

          <div className="grid gap-4 md:grid-cols-1">
            <div>
              <label
                htmlFor="renderingsPath"
                className="block text-sm font-medium text-zinc-700"
              >
                Renderings path
              </label>
              <input
                id="renderingsPath"
                value={renderingsPath}
                onChange={(event) => setRenderingsPath(event.target.value)}
                required
                placeholder="/sitecore/layout/Renderings/Feature/YourProject"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2"
              />
            </div>

            <div>
              <label
                htmlFor="mediaPath"
                className="block text-sm font-medium text-zinc-700"
              >
                Media path
              </label>
              <input
                id="mediaPath"
                value={mediaPath}
                onChange={(event) => setMediaPath(event.target.value)}
                required
                placeholder="/sitecore/media/Project/YourProject"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2"
              />
            </div>

            <div>
              <label
                htmlFor="templatesPath"
                className="block text-sm font-medium text-zinc-700"
              >
                Templates path
              </label>
              <input
                id="templatesPath"
                value={templatesPath}
                onChange={(event) => setTemplatesPath(event.target.value)}
                required
                placeholder="/sitecore/templates/Feature/YourProject"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2"
              />
            </div>

            <div>
              <label
                htmlFor="pageTemplatePath"
                className="block text-sm font-medium text-zinc-700"
              >
                Page template path (optional)
              </label>
              <input
                id="pageTemplatePath"
                value={pageTemplatePath}
                onChange={(event) => setPageTemplatePath(event.target.value)}
                placeholder="/sitecore/templates/Project/Page"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Used when creating missing target pages during migrate push. If
                empty, MigrateX infers the template from a sibling page.
              </p>
            </div>

            <div>
              <label
                htmlFor="sxaPageDataTemplatePath"
                className="block text-sm font-medium text-zinc-700"
              >
                SXA Page Data template path (optional)
              </label>
              <input
                id="sxaPageDataTemplatePath"
                value={sxaPageDataTemplatePath}
                onChange={(event) =>
                  setSxaPageDataTemplatePath(event.target.value)
                }
                placeholder={DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Template for the page-level <span className="font-mono">Data</span>{" "}
                item created under new SXA pages during migrate push.
              </p>
            </div>
          </div>

          {feedback && (
            <div
              role="status"
              className={`rounded-lg px-4 py-3 text-sm ${
                feedback.type === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border border-rose-200 bg-rose-50 text-rose-900"
              }`}
            >
              {feedback.message}
            </div>
          )}

          <button
            type="submit"
            disabled={isDiscovering || !selectedSite}
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDiscovering ? "Validating paths…" : "Validate paths & discover"}
          </button>
        </form>

        {result && <DiscoveryResults result={result} />}

        {result?.success && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-6">
            <p className="text-sm text-zinc-600">
              Discovery complete. Choose how you want to map content.
            </p>
            <NextPhaseButton
              currentPhaseId="discovery"
              className="bg-teal-600 hover:bg-teal-700"
            />
          </div>
        )}
      </div>
    </div>
  );
}
