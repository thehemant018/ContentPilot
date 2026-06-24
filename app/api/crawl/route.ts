import { NextResponse } from "next/server";
import { runCrawl } from "@/lib/crawl/crawler";
import type { CrawlInput, CrawlResult } from "@/types/crawl";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CrawlInput;
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json<CrawlResult>(
        { success: false, message: "Source URL is required." },
        { status: 400 },
      );
    }

    const mode = body.mode === "site" ? "site" : "single";

    const result = await runCrawl({
      url,
      mode,
      maxPages: body.maxPages,
    });

    return NextResponse.json<CrawlResult>(result, {
      status: result.success ? 200 : 502,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Crawl request failed.";

    return NextResponse.json<CrawlResult>(
      { success: false, message },
      { status: 500 },
    );
  }
}
