import type { LlmProvider } from "@/types/ai-match";

export const GEMINI_REQUEST_DELAY_MS = 5_000;
export const CLAUDE_REQUEST_DELAY_MS = 1_500;
export const MAX_LLM_RETRIES = 3;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRateLimitError(status: number, message: string): boolean {
  const lower = message.toLowerCase();
  return (
    status === 429 ||
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota")
  );
}

export function isDailyQuotaExhausted(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("daily") && lower.includes("quota") ||
    lower.includes("quota is exhausted") ||
    lower.includes("exceeded your current quota")
  );
}

export function formatLlmError(message: string, provider: LlmProvider): string {
  if (isDailyQuotaExhausted(message)) {
    return provider === "gemini"
      ? "Gemini free daily quota is used up. Wait until it resets (UTC midnight), enable billing in Google AI Studio, or switch to Claude."
      : "Anthropic API quota is used up. Check your plan/billing or try again later.";
  }

  const lower = message.toLowerCase();
  if (
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("resource_exhausted")
  ) {
    return `API rate limit reached. Fewer blocks per run and slower pacing between calls help on free tiers. Details: ${message}`;
  }

  return message;
}

export async function withLlmRetry<T>(
  operation: () => Promise<T>,
  options?: { isRetryable?: (error: unknown) => boolean },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_LLM_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = options?.isRetryable?.(error) ?? false;
      if (!retryable || attempt === MAX_LLM_RETRIES - 1) {
        throw error;
      }

      const waitMs = 6_000 * 2 ** attempt;
      await sleep(waitMs);
    }
  }

  throw lastError;
}

export function requestDelayMs(provider: LlmProvider): number {
  return provider === "claude"
    ? CLAUDE_REQUEST_DELAY_MS
    : GEMINI_REQUEST_DELAY_MS;
}
