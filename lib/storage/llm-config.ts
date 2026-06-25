import { STORAGE_KEYS } from "@/lib/sitecore/constants";
import type { LlmConfig, LlmProvider } from "@/types/ai-match";

export const LLM_CONFIG_CHANGED_EVENT = "migratex-llm-config-changed";

function normalizeProvider(value: unknown): LlmProvider {
  if (value === "claude" || value === "groq" || value === "gemini") {
    return value;
  }
  return "gemini";
}

export function getLlmConfig(): LlmConfig {
  if (typeof window === "undefined") {
    return { provider: "gemini" };
  }

  const raw = localStorage.getItem(STORAGE_KEYS.llmConfig);
  if (!raw) {
    return { provider: "gemini" };
  }

  try {
    const parsed = JSON.parse(raw) as LlmConfig;
    return {
      provider: normalizeProvider(parsed.provider),
      geminiApiKey: parsed.geminiApiKey?.trim() || undefined,
      claudeApiKey: parsed.claudeApiKey?.trim() || undefined,
      groqApiKey: parsed.groqApiKey?.trim() || undefined,
      useRuleBasedMatching: parsed.useRuleBasedMatching === true,
    };
  } catch {
    return { provider: "gemini" };
  }
}

export function saveLlmConfig(config: LlmConfig): void {
  localStorage.setItem(STORAGE_KEYS.llmConfig, JSON.stringify(config));
  window.dispatchEvent(new Event(LLM_CONFIG_CHANGED_EVENT));
}

export function getActiveApiKey(provider: LlmProvider): string | undefined {
  const config = getLlmConfig();
  if (provider === "claude") {
    return config.claudeApiKey;
  }
  if (provider === "groq") {
    return config.groqApiKey;
  }
  return config.geminiApiKey;
}

export function clearLlmConfig(): void {
  localStorage.removeItem(STORAGE_KEYS.llmConfig);
  window.dispatchEvent(new Event(LLM_CONFIG_CHANGED_EVENT));
}
