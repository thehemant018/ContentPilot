"use client";

import { useEffect, useRef, useState } from "react";
import type { SitecoreConnectionResult } from "@/types/sitecore";
import type { StoredSitecoreSession } from "@/types/sitecore";
import {
  formatExpiry,
  getStoredSession,
  isSessionExpired,
  saveSession,
} from "@/lib/storage/sitecore-session";
import { disconnectSitecore } from "@/lib/sitecore/disconnect";
import { advanceToWorkflowPhase } from "@/lib/workflow/progress";

const AUTO_ADVANCE_DELAY_MS = 3000;

export function ConnectSitecoreForm({ embedded = false }: { embedded?: boolean }) {
  const [instanceUrl, setInstanceUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [itemOwner, setItemOwner] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [session, setSession] = useState<StoredSitecoreSession | null>(null);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = getStoredSession();
      if (stored) {
        setSession(stored);
        setInstanceUrl(stored.instanceUrl);
        setItemOwner(stored.itemOwner ?? "");
      }
    });

    return () => {
      if (advanceTimeoutRef.current) {
        clearTimeout(advanceTimeoutRef.current);
      }
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/sitecore/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceUrl, clientId, clientSecret, itemOwner }),
      });

      const result = (await response.json()) as SitecoreConnectionResult;

      if (!response.ok || !result.success || !result.token || !result.instanceUrl) {
        setIsSubmitting(false);
        setFeedback({
          type: "error",
          message:
            result.message ??
            `Connection failed (${response.status}). Check credentials and instance URL.`,
        });
        return;
      }

      const ownerToStore =
        (result.itemOwner ?? itemOwner.trim()) || undefined;
      const stored = saveSession(
        result.token,
        result.expiresIn ?? 86400,
        result.instanceUrl,
        ownerToStore,
      );

      setSession(stored);
      setClientSecret("");
      if (result.itemOwner) {
        setItemOwner(result.itemOwner);
      }
      setFeedback({
        type: "success",
        message: `${result.message} Moving to Discovery in 3 seconds…`,
      });

      if (advanceTimeoutRef.current) {
        clearTimeout(advanceTimeoutRef.current);
      }

      advanceTimeoutRef.current = setTimeout(() => {
        setIsSubmitting(false);
        advanceToWorkflowPhase("discovery");
      }, AUTO_ADVANCE_DELAY_MS);
    } catch {
      setIsSubmitting(false);
      setFeedback({
        type: "error",
        message: "Connection request failed. Check your network and try again.",
      });
    }
  }

  function handleDisconnect() {
    if (advanceTimeoutRef.current) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }

    setIsSubmitting(false);
    disconnectSitecore();
    setSession(null);
    setClientId("");
    setClientSecret("");
    setItemOwner("");
    setFeedback({
      type: "success",
      message: "Disconnected. Stored token removed from local storage.",
    });
  }

  const hasValidSession = session && !isSessionExpired(session);

  const Wrapper = embedded ? "div" : "section";

  return (
    <Wrapper
      id={embedded ? undefined : "connect"}
      className={
        embedded
          ? "w-full"
          : "w-full scroll-mt-24 rounded-2xl border border-teal-200 bg-white p-6 shadow-sm ring-1 ring-teal-100"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">
            Phase 1 - Authentication
          </p>
          <h2 className="font-display mt-1 text-xl font-semibold text-slate-900">
            Connect to Sitecore XM Cloud
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Enter your XM instance URL and automation client credentials. We
            validate against the Identity Server token endpoint and confirm the
            Authoring Content API is reachable. Optionally set a Sitecore username
            as item owner; leave it blank to keep the default client ID owner.
          </p>
        </div>
        {hasValidSession && (
          <span className="shrink-0 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Connected
          </span>
        )}
      </div>

      {hasValidSession && session && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-medium">Active session in local storage</p>
          <p className="mt-1 text-emerald-800">
            Instance: <span className="font-mono text-xs">{session.instanceUrl}</span>
          </p>
          <p className="mt-1 text-emerald-800">
            Token expires: {formatExpiry(session)}
          </p>
          {session.itemOwner && (
            <p className="mt-1 text-emerald-800">
              Item owner:{" "}
              <span className="font-mono text-xs">{session.itemOwner}</span>
            </p>
          )}
        </div>
      )}

      {session && isSessionExpired(session) && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your stored token has expired. Reconnect with your credentials.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="instanceUrl"
            className="block text-sm font-medium text-slate-700"
          >
            Sitecore XM instance URL
          </label>
          <input
            id="instanceUrl"
            name="instanceUrl"
            type="url"
            required
            placeholder="https://your-env.sitecorecloud.io"
            value={instanceUrl}
            onChange={(event) => setInstanceUrl(event.target.value)}
            disabled={isSubmitting}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-shadow focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
          />
        </div>

        <div>
          <label
            htmlFor="clientId"
            className="block text-sm font-medium text-slate-700"
          >
            Client ID
          </label>
          <input
            id="clientId"
            name="clientId"
            type="text"
            required
            autoComplete="off"
            placeholder="Automation client ID from XM Cloud Deploy"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            disabled={isSubmitting}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-shadow focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
          />
        </div>

        <div>
          <label
            htmlFor="clientSecret"
            className="block text-sm font-medium text-slate-700"
          >
            Client secret
          </label>
          <input
            id="clientSecret"
            name="clientSecret"
            type="password"
            required={!hasValidSession}
            autoComplete="off"
            placeholder="Automation client secret"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            disabled={isSubmitting}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-shadow focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
          />
        </div>

        <div>
          <label
            htmlFor="itemOwner"
            className="block text-sm font-medium text-slate-700"
          >
            Item owner (Sitecore username){" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="itemOwner"
            name="itemOwner"
            type="text"
            autoComplete="off"
            placeholder="sitecore\abc.company.com"
            value={itemOwner}
            onChange={(event) => setItemOwner(event.target.value)}
            disabled={isSubmitting}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-shadow focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
          />
          <p className="mt-1 text-xs text-slate-500">
            Optional. If set, we verify the user exists in Sitecore after client
            credentials succeed. Leave blank to keep the default Owner (client ID).
          </p>
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

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden="true"
              />
            )}
            {isSubmitting
              ? feedback?.type === "success"
                ? "Moving to Discovery…"
                : "Validating connection…"
              : "Connect & validate"}
          </button>
          {session && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Disconnect
            </button>
          )}
        </div>
      </form>
    </Wrapper>
  );
}
