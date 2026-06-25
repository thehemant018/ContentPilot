import { NextResponse } from "next/server";
import {
  getLlmApiKeyFromEnv,
  getLlmEnvStatus,
  missingLlmKeyMessage,
} from "@/lib/ai-match/env-keys";
import { flattenBlocksForMatching } from "@/lib/ai-match/flatten-blocks";
import { runAiMatch } from "@/lib/ai-match/service";
import { slimDiscoveryResult } from "@/lib/sitecore/discovery/slim-result";
import type { AiMatchInput, AiMatchResult, LlmProvider } from "@/types/ai-match";
import type { CrawlResult } from "@/types/crawl";
import type { DiscoveryResult } from "@/types/discovery";

export const maxDuration = 120;

function normalizeProvider(value: unknown): LlmProvider {
  if (value === "claude" || value === "groq" || value === "gemini") {
    return value;
  }
  return "gemini";
}

export async function GET() {
  return NextResponse.json({
    configured: getLlmEnvStatus(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      provider?: AiMatchInput["provider"];
      useRuleBasedMatching?: boolean;
      discovery?: DiscoveryResult;
      crawl?: CrawlResult;
    };

    const provider = normalizeProvider(body.provider);
    const useRuleBasedMatching = body.useRuleBasedMatching === true;
    const apiKey = getLlmApiKeyFromEnv(provider);
    const discovery = body.discovery
      ? slimDiscoveryResult(body.discovery)
      : undefined;
    const crawl = body.crawl;

    if (!discovery?.success || !crawl?.success) {
      return NextResponse.json<AiMatchResult>(
        {
          success: false,
          message: "Complete Discovery and Crawl before running AI matching.",
        },
        { status: 400 },
      );
    }

    if (!useRuleBasedMatching && !apiKey) {
      return NextResponse.json<AiMatchResult>(
        {
          success: false,
          message: missingLlmKeyMessage(provider),
        },
        { status: 400 },
      );
    }

    const blocks = flattenBlocksForMatching(crawl.pages ?? []);

    const result = await runAiMatch({
      provider,
      apiKey,
      useRuleBasedMatching,
      blocks,
      renderings: discovery.renderings ?? [],
      templates: discovery.templates ?? [],
    });

    return NextResponse.json<AiMatchResult>(result, {
      status: result.success ? 200 : 502,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI matching request failed.";

    return NextResponse.json<AiMatchResult>(
      { success: false, message },
      { status: 500 },
    );
  }
}
