"use client";

import { useEffect, useState } from "react";
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
} from "@/lib/storage/workflow-data";
import {
  advanceToWorkflowPhase,
  isCrawlPhaseComplete,
  isDiscoveryPhaseComplete,
  markAiMatchPhaseComplete,
} from "@/lib/workflow/progress";
import type { AiMatchResult, LlmProvider } from "@/types/ai-match";

export function AiMatchPanel({ embedded = false }: { embedded?: boolean }) {
  const [provider, setProvider] = useState<LlmProvider>("gemini");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [useRuleBasedMatching, setUseRuleBasedMatching] = useState(false);
  const [prerequisitesMet, setPrerequisitesMet] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [result, setResult] = useState<AiMatchResult | null>(null);

  const activeApiKey =
    provider === "claude"
      ? claudeApiKey.trim()
      : provider === "groq"
        ? groqApiKey.trim()
        : geminiApiKey.trim();
  const canRunMatch =
    useRuleBasedMatching || Boolean(activeApiKey);
  const matchModeLabel = useRuleBasedMatching
    ? "Rule-based matching"
    : activeApiKey
      ? `LLM · ${getDefaultModelLabel(provider)}`
      : `Add a ${provider === "groq" ? "Groq" : provider === "claude" ? "Claude" : "Gemini"} API key or enable rule-based matching`;

  useEffect(() => {
    queueMicrotask(() => {
      const config = getLlmConfig();
      setProvider(config.provider);
      setGeminiApiKey(config.geminiApiKey ?? "");
      setClaudeApiKey(config.claudeApiKey ?? "");
      setGroqApiKey(config.groqApiKey ?? "");
      setUseRuleBasedMatching(config.useRuleBasedMatching === true);
      setPrerequisitesMet(
        isDiscoveryPhaseComplete() &&
          isCrawlPhaseComplete() &&
          Boolean(getDiscoveryResult()) &&
          Boolean(getCrawlResult()),
      );
    });
  }, []);

  function persistLlmConfig(nextProvider: LlmProvider = provider) {
    saveLlmConfig({
      provider: nextProvider,
      geminiApiKey: geminiApiKey.trim() || undefined,
      claudeApiKey: claudeApiKey.trim() || undefined,
      groqApiKey: groqApiKey.trim() || undefined,
      useRuleBasedMatching,
    });
  }

  function handleProviderChange(nextProvider: LlmProvider) {
    setProvider(nextProvider);
    persistLlmConfig(nextProvider);
  }

  function handleSaveKeys(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    persistLlmConfig();
    setFeedback({
      type: "success",
      message: "API keys saved in this browser (localStorage).",
    });
  }

  async function handleRunMatch() {
    setFeedback(null);
    setResult(null);
    setIsMatching(true);

    const discovery = getDiscoveryResult();
    const crawl = getCrawlResult();
    const apiKey = activeApiKey;

    persistLlmConfig();

    try {
      const response = await fetch("/api/ai-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
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
          Phase 4 — AI Match
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
          Choose rule-based name matching, or LLM matching with an API key. There
          is no automatic fallback between the two modes.
        </p>
      </div>

      <ReturnToCrawlBanner />

      <form
        onSubmit={handleSaveKeys}
        className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5"
      >
        <h4 className="text-sm font-semibold text-zinc-900">LLM provider</h4>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="radio"
              name="llm-provider"
              value="gemini"
              checked={provider === "gemini"}
              onChange={() => handleProviderChange("gemini")}
            />
            Google Gemini ({getDefaultModelLabel("gemini")})
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="radio"
              name="llm-provider"
              value="claude"
              checked={provider === "claude"}
              onChange={() => handleProviderChange("claude")}
            />
            Anthropic Claude ({getDefaultModelLabel("claude")})
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="radio"
              name="llm-provider"
              value="groq"
              checked={provider === "groq"}
              onChange={() => handleProviderChange("groq")}
            />
            Groq ({getDefaultModelLabel("groq")})
          </label>
        </div>

        <p className="text-xs text-zinc-500">
          Run matching uses the <span className="font-medium">selected</span>{" "}
          provider only. Select a provider above, then enter its API key below.
        </p>

        {provider === "gemini" && (
          <div>
            <label
              htmlFor="gemini-api-key"
              className="block text-sm font-medium text-zinc-700"
            >
              Gemini API key
            </label>
            <input
              id="gemini-api-key"
              type="password"
              value={geminiApiKey}
              onChange={(event) => setGeminiApiKey(event.target.value)}
              placeholder="AIza..."
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:border-orange-500 focus:ring-2"
            />
          </div>
        )}

        {provider === "claude" && (
          <div>
            <label
              htmlFor="claude-api-key"
              className="block text-sm font-medium text-zinc-700"
            >
              Claude API key
            </label>
            <input
              id="claude-api-key"
              type="password"
              value={claudeApiKey}
              onChange={(event) => setClaudeApiKey(event.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:border-orange-500 focus:ring-2"
            />
          </div>
        )}

        {provider === "groq" && (
          <div>
            <label
              htmlFor="groq-api-key"
              className="block text-sm font-medium text-zinc-700"
            >
              Groq API key
            </label>
            <input
              id="groq-api-key"
              type="password"
              value={groqApiKey}
              onChange={(event) => setGroqApiKey(event.target.value)}
              placeholder="gsk_..."
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:border-orange-500 focus:ring-2"
            />
          </div>
        )}

        <p className="text-xs text-zinc-500">
          Keys stay in your browser only. Uncheck rule-based to use the LLM
          (API key required). Check rule-based to skip the LLM entirely.
        </p>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <input
            type="checkbox"
            checked={useRuleBasedMatching}
            onChange={(event) => setUseRuleBasedMatching(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-500"
          />
          <span className="text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">
              Use rule-based matching
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Match crawl block types to Sitecore component names by keywords
              (e.g. hero → Hero). No API key required.
            </span>
          </span>
        </label>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100"
        >
          Save API keys
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleRunMatch()}
          disabled={isMatching || !canRunMatch}
          className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isMatching ? "Matching blocks…" : "Run matching"}
        </button>
        <span className="text-xs text-zinc-500">{matchModeLabel}</span>
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
            className="inline-flex items-center justify-center rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 transition-colors hover:bg-violet-100"
          >
            Open Review queue →
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
