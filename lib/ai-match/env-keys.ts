import type { LlmProvider } from "@/types/ai-match";

const ENV_VAR_BY_PROVIDER: Record<LlmProvider, string[]> = {
  gemini: ["GEMINI_API_KEY"],
  claude: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
  groq: ["GROQ_API_KEY"],
};

export function getLlmEnvVarName(provider: LlmProvider): string {
  return ENV_VAR_BY_PROVIDER[provider][0]!;
}

export function getLlmApiKeyFromEnv(provider: LlmProvider): string {
  for (const name of ENV_VAR_BY_PROVIDER[provider]) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

export function isLlmProviderConfigured(provider: LlmProvider): boolean {
  return getLlmApiKeyFromEnv(provider).length > 0;
}

export function getLlmEnvStatus(): Record<LlmProvider, boolean> {
  return {
    gemini: isLlmProviderConfigured("gemini"),
    claude: isLlmProviderConfigured("claude"),
    groq: isLlmProviderConfigured("groq"),
  };
}

export function missingLlmKeyMessage(provider: LlmProvider): string {
  const primary = getLlmEnvVarName(provider);
  const aliases = ENV_VAR_BY_PROVIDER[provider].slice(1);
  const aliasHint =
    aliases.length > 0 ? ` (or ${aliases.join(" / ")})` : "";
  return `${primary}${aliasHint} is not set. Add it to .env.local or enable rule-based matching.`;
}
