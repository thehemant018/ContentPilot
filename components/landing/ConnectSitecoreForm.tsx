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
        body: JSON.stringify({ instanceUrl, clientId, clientSecret }),
      });

      const result = (await response.json()) as SitecoreConnectionResult;

      if (!result.success || !result.token || !result.instanceUrl) {
        setFeedback({
          type: "error",
          message: result.message,
        });
        return;
      }

      const stored = saveSession(
        result.token,
        result.expiresIn ?? 86400,
        result.instanceUrl,
      );

      setSession(stored);
      setClientSecret("");
      setFeedback({
        type: "success",
        message: `${result.message} Moving to Discovery in 3 seconds…`,
      });

      if (advanceTimeoutRef.current) {
        clearTimeout(advanceTimeoutRef.current);
      }

      advanceTimeoutRef.current = setTimeout(() => {
        advanceToWorkflowPhase("discovery");
      }, AUTO_ADVANCE_DELAY_MS);
    } catch {
      setFeedback({
        type: "error",
        message: "Connection request failed. Check your network and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDisconnect() {
    if (advanceTimeoutRef.current) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }

    disconnectSitecore();
    setSession(null);
    setClientId("");
    setClientSecret("");
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
          : "w-full scroll-mt-24 rounded-2xl border border-violet-200 bg-white p-6 shadow-sm ring-1 ring-violet-100"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
            Phase 1 — Authentication
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-900">
            Connect to Sitecore XM Cloud
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Enter your XM instance URL and automation client credentials. We
            validate against the Identity Server token endpoint and confirm the
            Authoring Content API is reachable. Read-only — nothing is written
            to Sitecore.
          </p>
        </div>
        {hasValidSession && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
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
            className="block text-sm font-medium text-zinc-700"
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
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none ring-violet-500 focus:border-violet-500 focus:ring-2"
          />
        </div>

        <div>
          <label
            htmlFor="clientId"
            className="block text-sm font-medium text-zinc-700"
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
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none ring-violet-500 focus:border-violet-500 focus:ring-2"
          />
        </div>

        <div>
          <label
            htmlFor="clientSecret"
            className="block text-sm font-medium text-zinc-700"
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
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none ring-violet-500 focus:border-violet-500 focus:ring-2"
          />
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
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Validating connection…" : "Connect & validate"}
          </button>
          {session && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Disconnect
            </button>
          )}
        </div>
      </form>
    </Wrapper>
  );
}
