import { STORAGE_KEYS } from "@/lib/sitecore/constants";
import type { LlmConfig, LlmProvider } from "@/types/ai-match";

export const LLM_CONFIG_CHANGED_EVENT = "migratex-llm-config-changed";

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
      provider: parsed.provider === "claude" ? "claude" : "gemini",
      geminiApiKey: parsed.geminiApiKey?.trim() || undefined,
      claudeApiKey: parsed.claudeApiKey?.trim() || undefined,
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
  return provider === "claude" ? config.claudeApiKey : config.geminiApiKey;
}

export function clearLlmConfig(): void {
  localStorage.removeItem(STORAGE_KEYS.llmConfig);
  window.dispatchEvent(new Event(LLM_CONFIG_CHANGED_EVENT));
}
