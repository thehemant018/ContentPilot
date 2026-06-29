import { sanitizeBrowserWarning } from "@/lib/crawl/crawl-messages";

const BROWSER_TIMEOUT_MS = 45_000;
const LOADING_WAIT_MS = 12_000;

export interface BrowserFetchResult {
  html: string;
  rendered: boolean;
  warning?: string;
}

async function waitForRenderedContent(page: {
  waitForFunction: (
    fn: () => boolean,
    options?: { timeout?: number },
  ) => Promise<unknown>;
}): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const text = document.body?.innerText ?? "";
        if (/loading component/i.test(text) && text.length < 120) {
          return false;
        }

        const main = document.querySelector("main, [role='main'], #__next, body");
        if (!main) {
          return true;
        }

        return (
          main.querySelectorAll("section, article, h1, h2, [class*='grid']").length >
          0
        );
      },
      { timeout: LOADING_WAIT_MS },
    )
    .catch(() => undefined);
}

export async function fetchRenderedHtml(url: string): Promise<BrowserFetchResult> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage"],
    });

    try {
      const page = await browser.newPage({
        userAgent:
          "MigrateX/1.0 (content migration crawler; +https://github.com/)",
      });

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: BROWSER_TIMEOUT_MS,
      });

      await waitForRenderedContent(page);
      await page.waitForTimeout(750);

      const html = await page.content();
      return { html, rendered: true };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      html: "",
      rendered: false,
      warning: sanitizeBrowserWarning(error),
    };
  }
}

export async function isBrowserCrawlAvailable(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}
