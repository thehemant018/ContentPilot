import { NextResponse } from "next/server";
import { flattenCrawlBlocks, runAiMatch } from "@/lib/ai-match/service";
import type { AiMatchInput, AiMatchResult } from "@/types/ai-match";
import type { CrawlResult } from "@/types/crawl";
import type { DiscoveryResult } from "@/types/discovery";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      provider?: AiMatchInput["provider"];
      apiKey?: string;
      discovery?: DiscoveryResult;
      crawl?: CrawlResult;
    };

    const provider = body.provider === "claude" ? "claude" : "gemini";
    const apiKey = body.apiKey?.trim() ?? "";
    const discovery = body.discovery;
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

    const blocks = flattenCrawlBlocks(crawl.pages ?? []);

    const result = await runAiMatch({
      provider,
      apiKey,
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
