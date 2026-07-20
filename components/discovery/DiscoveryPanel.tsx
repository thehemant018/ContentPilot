"use client";

import { useEffect, useState } from "react";
import { SESSION_CHANGED_EVENT } from "@/lib/sitecore/constants";
import { sitecoreApiFetch } from "@/lib/sitecore/api-client";
import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";
import type { DiscoveryResult, SitecoreSite } from "@/types/discovery";
import { DiscoveryProgress } from "@/components/discovery/DiscoveryProgress";
import { DiscoveryResults } from "@/components/discovery/DiscoveryResults";
import { SiteSelector } from "@/components/discovery/SiteSelector";
import { NextPhaseButton } from "@/components/workflow/NextPhaseButton";
import { markDiscoveryPhaseComplete } from "@/lib/workflow/progress";
import {
  saveDiscoveryResult,
  getDiscoveryResult,
  WORKFLOW_DATA_CHANGED_EVENT,
} from "@/lib/storage/workflow-data";
import { DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH } from "@/lib/migration/sxa-page-structure";
import { saveVisualMapperSiteId } from "@/lib/visual-mapper/session-storage";

const DEFAULT_RENDERINGS_PATH = "/sitecore/layout/Renderings";
const DEFAULT_PLACEHOLDERS_PATH = "/sitecore/layout/Placeholder Settings";
const DEFAULT_MEDIA_PATH = "/sitecore/media";
const DEFAULT_TEMPLATES_PATH = "/sitecore/templates";

function resolveSiteFromDiscovery(
  sites: SitecoreSite[],
  saved: DiscoveryResult | null,
): SitecoreSite | null {
  if (!saved || sites.length === 0) {
    return null;
  }

  return (
    sites.find(
      (site) =>
        (saved.selectedSiteName && site.name === saved.selectedSiteName) ||
        (saved.selectedSiteRootPath &&
          site.rootPath === saved.selectedSiteRootPath),
    ) ?? null
  );
}

export function DiscoveryPanel({ embedded = false }: { embedded?: boolean }) {
  const [isConnected, setIsConnected] = useState(false);
  const [sites, setSites] = useState<SitecoreSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<SitecoreSite | null>(null);
  const [renderingsPath, setRenderingsPath] = useState(DEFAULT_RENDERINGS_PATH);
  const [placeholdersPath, setPlaceholdersPath] = useState(
    DEFAULT_PLACEHOLDERS_PATH,
  );
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

  function hydrateFromSavedDiscovery(
    saved: DiscoveryResult | null = getDiscoveryResult(),
  ): boolean {
    if (!saved?.success) {
      return false;
    }

    setResult(saved);
    setFeedback({
      type: "success",
      message:
        saved.message ||
        "Previous discovery results restored. Re-validate if your Sitecore paths changed.",
    });

    if (saved.mediaPath?.trim()) {
      setMediaPath(saved.mediaPath.trim());
    }
    if (saved.placeholdersPath?.trim()) {
      setPlaceholdersPath(saved.placeholdersPath.trim());
    }
    if (saved.pageTemplatePath) {
      setPageTemplatePath(saved.pageTemplatePath);
    }
    if (saved.sxaPageDataTemplatePath) {
      setSxaPageDataTemplatePath(saved.sxaPageDataTemplatePath);
    }

    return true;
  }

  async function loadSites() {
    setIsLoadingSites(true);
    setFeedback((current) => (current?.type === "error" ? null : current));

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
      const saved = getDiscoveryResult();
      const matchedSite = resolveSiteFromDiscovery(payload.sites, saved);
      if (matchedSite) {
        setSelectedSite(matchedSite);
      } else if (payload.sites.length === 1) {
        setSelectedSite(payload.sites[0]!);
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
      hydrateFromSavedDiscovery();
    });

    function handleSessionChange() {
      refreshConnectionState();
      setSites([]);
      setSelectedSite(null);

      const session = getStoredSession();
      if (session && !isSessionExpired(session) && hydrateFromSavedDiscovery()) {
        return;
      }

      setResult(null);
      setFeedback(null);
    }

    function handleWorkflowDataChanged() {
      if (!getDiscoveryResult()?.success) {
        return;
      }
      hydrateFromSavedDiscovery();
    }

    window.addEventListener(SESSION_CHANGED_EVENT, handleSessionChange);
    window.addEventListener(
      WORKFLOW_DATA_CHANGED_EVENT,
      handleWorkflowDataChanged,
    );
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, handleSessionChange);
      window.removeEventListener(
        WORKFLOW_DATA_CHANGED_EVENT,
        handleWorkflowDataChanged,
      );
    };
  }, []);

  useEffect(() => {
    if (isConnected) {
      queueMicrotask(() => {
        void loadSites();
      });
    }
  }, [isConnected]);

  useEffect(() => {
    if (selectedSite || sites.length === 0) {
      return;
    }
    const matchedSite = resolveSiteFromDiscovery(sites, getDiscoveryResult());
    if (matchedSite) {
      setSelectedSite(matchedSite);
    }
  }, [sites, selectedSite]);

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
          siteRootPath: selectedSite.rootPath,
          renderingsPath,
          placeholdersPath,
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

  const hasSavedDiscovery = Boolean(result?.success);
  const wrapperClass = embedded
    ? "w-full"
    : "w-full scroll-mt-24 rounded-2xl border p-6 shadow-sm ring-1";

  if (!isConnected) {
    return (
      <div
        id={embedded ? undefined : "discovery"}
        className={
          embedded ? "w-full" : `${wrapperClass} border-zinc-200 bg-zinc-50`
        }
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">
          Phase 2 - Discovery
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
            className="font-semibold text-teal-700 underline-offset-2 hover:underline"
          >
            Auth
          </button>{" "}
          phase first. Discovery needs an active session.
        </p>
      </div>
    );
  }

  return (
    <div
      id={embedded ? undefined : "discovery"}
      className={
        embedded ? "w-full" : `${wrapperClass} border-teal-100 bg-white`
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">
            Phase 2 - Discovery
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-900">
            Site &amp; template discovery
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Validate Sitecore paths and load renderings, placeholders,
            templates, and languages for the selected site.
            {hasSavedDiscovery
              ? " Previous validated results are shown below — re-run discovery if your portal paths changed."
              : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSites()}
          disabled={isLoadingSites}
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 disabled:opacity-60"
        >
          {isLoadingSites ? "Refreshing..." : "Refresh sites"}
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
            placeholder settings, media, and templates. We check each path
            exists before loading related items.
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
                disabled={isDiscovering}
                required
                placeholder="/sitecore/layout/Renderings/Feature/YourProject"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70"
              />
            </div>

            <div>
              <label
                htmlFor="placeholdersPath"
                className="block text-sm font-medium text-zinc-700"
              >
                Placeholder settings path
              </label>
              <input
                id="placeholdersPath"
                value={placeholdersPath}
                onChange={(event) => setPlaceholdersPath(event.target.value)}
                disabled={isDiscovering}
                required
                placeholder="/sitecore/layout/Placeholder Settings/Feature/YourProject"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70"
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
                disabled={isDiscovering}
                required
                placeholder="/sitecore/media/Project/YourProject"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70"
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
                disabled={isDiscovering}
                required
                placeholder="/sitecore/templates/Feature/YourProject"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70"
              />
            </div>

            <div>
              <label
                htmlFor="pageTemplatePath"
                className="block text-sm font-medium text-zinc-700"
              >
                Page template path{" "}
                <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                id="pageTemplatePath"
                value={pageTemplatePath}
                onChange={(event) => setPageTemplatePath(event.target.value)}
                disabled={isDiscovering}
                placeholder="/sitecore/templates/Project/YourSite/Page"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70"
              />
            </div>

            <div>
              <label
                htmlFor="sxaPageDataTemplatePath"
                className="block text-sm font-medium text-zinc-700"
              >
                SXA Page Data template path{" "}
                <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                id="sxaPageDataTemplatePath"
                value={sxaPageDataTemplatePath}
                onChange={(event) =>
                  setSxaPageDataTemplatePath(event.target.value)
                }
                disabled={isDiscovering}
                placeholder={DEFAULT_SXA_PAGE_DATA_TEMPLATE_PATH}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-teal-500 focus:border-teal-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70"
              />
            </div>
          </div>

          {feedback && !isDiscovering && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                feedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              }`}
            >
              {feedback.message}
            </div>
          )}

          <DiscoveryProgress isActive={isDiscovering} />

          <button
            type="submit"
            disabled={isDiscovering || !selectedSite}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDiscovering && (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden="true"
              />
            )}
            {isDiscovering
              ? "Discovering..."
              : hasSavedDiscovery
                ? "Re-validate paths & discover"
                : "Validate paths & discover"}
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
