"use client";

import { useCallback, useEffect, useState } from "react";
import { MatchResults } from "@/components/ai-match/MatchResults";
import { MatchStrategyBadge } from "@/components/ai-match/MatchStrategyBadge";
import { NextPhaseButton } from "@/components/workflow/NextPhaseButton";
import { ReturnToCrawlBanner } from "@/components/workflow/ReturnToCrawlBanner";
import { getDefaultModelLabel } from "@/lib/ai-match/default-models";
import {
  getLlmConfig,
  saveLlmConfig,
} from "@/lib/storage/llm-config";
import {
  getCrawlResult,
  getDiscoveryResult,
  saveAiMatchResult,
  WORKFLOW_DATA_CHANGED_EVENT,
} from "@/lib/storage/workflow-data";
import {
  advanceToWorkflowPhase,
  isCrawlPhaseComplete,
  isDiscoveryPhaseComplete,
  markAiMatchPhaseComplete,
  subscribeWorkflowProgress,
} from "@/lib/workflow/progress";
import type { AiMatchResult, LlmProvider } from "@/types/ai-match";

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  gemini: "Google Gemini",
  claude: "Anthropic Claude",
  groq: "Groq",
};

export function AiMatchPanel({ embedded = false }: { embedded?: boolean }) {
  const [provider, setProvider] = useState<LlmProvider>("gemini");
  const [useRuleBasedMatching, setUseRuleBasedMatching] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState<
    Record<LlmProvider, boolean>
  >({
    gemini: false,
    claude: false,
    groq: false,
  });
  const [prerequisitesMet, setPrerequisitesMet] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [result, setResult] = useState<AiMatchResult | null>(null);

  const llmReady = providerConfigured[provider];
  const canRunMatch = useRuleBasedMatching || llmReady;
  const matchModeLabel = useRuleBasedMatching
    ? "Rule-based matching"
    : llmReady
      ? `LLM Â· ${getDefaultModelLabel(provider)}`
      : `Set ${provider === "claude" ? "ANTHROPIC_API_KEY" : provider === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY"} in .env.local`;

  const refreshPrerequisites = useCallback(() => {
    setPrerequisitesMet(
      isDiscoveryPhaseComplete() &&
        isCrawlPhaseComplete() &&
        Boolean(getDiscoveryResult()) &&
        Boolean(getCrawlResult()),
    );
  }, []);

  useEffect(() => {
    queueMicrotask(refreshPrerequisites);
    const unsubscribeProgress = subscribeWorkflowProgress(refreshPrerequisites);

    function handleWorkflowDataChanged() {
      refreshPrerequisites();
    }

    window.addEventListener(
      WORKFLOW_DATA_CHANGED_EVENT,
      handleWorkflowDataChanged,
    );
    return () => {
      unsubscribeProgress();
      window.removeEventListener(
        WORKFLOW_DATA_CHANGED_EVENT,
        handleWorkflowDataChanged,
      );
    };
  }, [refreshPrerequisites]);

  useEffect(() => {
    queueMicrotask(() => {
      const config = getLlmConfig();
      setProvider(config.provider);
      setUseRuleBasedMatching(config.useRuleBasedMatching === true);
    });

    void fetch("/api/ai-match")
      .then((response) => response.json())
      .then((payload: { configured?: Record<LlmProvider, boolean> }) => {
        if (payload.configured) {
          setProviderConfigured(payload.configured);
        }
      })
      .catch(() => {
        /* env status is optional for UI hints */
      });
  }, []);

  function persistLlmConfig(
    nextProvider: LlmProvider = provider,
    nextRuleBased: boolean = useRuleBasedMatching,
  ) {
    saveLlmConfig({
      provider: nextProvider,
      useRuleBasedMatching: nextRuleBased,
    });
  }

  function handleProviderChange(nextProvider: LlmProvider) {
    setProvider(nextProvider);
    persistLlmConfig(nextProvider);
  }

  function handleRuleBasedChange(checked: boolean) {
    setUseRuleBasedMatching(checked);
    persistLlmConfig(provider, checked);
  }

  async function handleRunMatch() {
    setFeedback(null);
    setResult(null);
    setIsMatching(true);

    const discovery = getDiscoveryResult();
    const crawl = getCrawlResult();

    persistLlmConfig();

    try {
      const response = await fetch("/api/ai-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          useRuleBasedMatching,
          discovery: discovery
            ? {
                success: true,
                renderings: discovery.renderings,
                templates: discovery.templates,
              }
            : undefined,
          crawl,
        }),
      });

      const payload = (await response.json()) as AiMatchResult;

      if (!response.ok || !payload.success) {
        setFeedback({
          type: "error",
          message: payload.message ?? "AI matching failed.",
        });
        return;
      }

      setResult(payload);
      saveAiMatchResult(payload);
      markAiMatchPhaseComplete();
      setFeedback({
        type: "success",
        message: payload.message,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "AI matching request failed.",
      });
    } finally {
      setIsMatching(false);
    }
  }

  if (!prerequisitesMet) {
    return (
      <div
        className={
          embedded
            ? "rounded-xl border border-amber-200 bg-amber-50 p-5"
            : "mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6"
        }
      >
        <h3 className="text-lg font-semibold text-amber-900">
          Complete Discovery and Crawl first
        </h3>
        <p className="mt-2 text-sm text-amber-800">
          AI matching needs Sitecore renderings, templates, and crawled content
          blocks from the previous phases.
        </p>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-5xl space-y-6"}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
          Phase 5 - AI Match
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-zinc-900">
            AI component matching
          </h3>
          {result?.matchStrategy && (
            <MatchStrategyBadge strategy={result.matchStrategy} />
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          API keys are read from your server environment (.env.local). Choose a
          provider and run matching, or use rule-based matching without an LLM.
        </p>
      </div>

      <ReturnToCrawlBanner />

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <div>
          <label
            htmlFor="llm-provider"
            className="block text-sm font-semibold text-zinc-900"
          >
            LLM provider
          </label>
          <select
            id="llm-provider"
            value={provider}
            onChange={(event) =>
              handleProviderChange(event.target.value as LlmProvider)
            }
            disabled={useRuleBasedMatching}
            className="mt-1.5 w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:border-orange-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
          >
            {(Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((key) => (
              <option key={key} value={key}>
                {PROVIDER_LABELS[key]} ({getDefaultModelLabel(key)})
                {providerConfigured[key] ? "" : " - key not set"}
              </option>
            ))}
          </select>
          {!useRuleBasedMatching && (
            <p className="mt-1.5 text-xs text-zinc-500">
              {llmReady
                ? `${PROVIDER_LABELS[provider]} API key found in environment.`
                : `No API key in environment for ${PROVIDER_LABELS[provider]}. Add the key to .env.local and restart the dev server.`}
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <input
            type="checkbox"
            checked={useRuleBasedMatching}
            onChange={(event) => handleRuleBasedChange(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-500"
          />
          <span className="text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">
              Use rule-based matching
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Match crawl block types to Sitecore component names by keywords
              (e.g. hero â†’ Hero). No API key required.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void handleRunMatch()}
            disabled={isMatching || !canRunMatch}
            className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMatching ? "Matching blocks..." : "Run matching"}
          </button>
          <span className="text-xs text-zinc-500">{matchModeLabel}</span>
        </div>
      </div>

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

      {result?.success && result.matches && (
        <MatchResults
          matches={result.matches}
          lowConfidenceCount={result.lowConfidenceCount}
          onQueueChange={(message) => {
            setFeedback({ type: "success", message });
          }}
        />
      )}

      {result?.success && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-6">
          <p className="text-sm text-zinc-600">
            Add components to the queue, then review and edit in the Review
            phase.
          </p>
          <button
            type="button"
            onClick={() => advanceToWorkflowPhase("review")}
            className="inline-flex items-center justify-center rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-100"
          >
            Open Review queue â†’
          </button>
          <NextPhaseButton
            currentPhaseId="ai-match"
            className="bg-orange-500 hover:bg-orange-600"
          />
        </div>
      )}
    </div>
  );
}
