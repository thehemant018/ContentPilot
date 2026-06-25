import type { LlmProvider } from "@/types/ai-match";

/** Primary model first; later entries are fallbacks if the API rejects a model id. */
export const GEMINI_MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

export const CLAUDE_MODELS = [
  "claude-3-5-haiku-latest",
  "claude-3-haiku-20240307",
  "claude-sonnet-4-20250514",
] as const;

export const GROQ_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
] as const;

export function getDefaultModels(provider: LlmProvider): readonly string[] {
  if (provider === "claude") {
    return CLAUDE_MODELS;
  }
  if (provider === "groq") {
    return GROQ_MODELS;
  }
  return GEMINI_MODELS;
}

export function getDefaultModelId(provider: LlmProvider): string {
  return getDefaultModels(provider)[0]!;
}

export function getDefaultModelLabel(provider: LlmProvider): string {
  if (provider === "claude") {
    return "Claude Haiku";
  }
  if (provider === "groq") {
    return "Llama 3.1 8B";
  }
  return "Gemini 2.0 Flash Lite";
}

export function isModelNotFoundError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("not supported") ||
    lower.includes("invalid model") ||
    lower.includes("model is not")
  );
}
