import { normalizeSourcePageUrl } from "@/lib/migration/sitecore-path";
import type { BlockMatchResult } from "@/types/ai-match";
import type { CrawledPage } from "@/types/crawl";

export interface PageMatchGroup {
  pageUrl: string;
  normalizedUrl: string;
  pageTitle?: string;
  matches: BlockMatchResult[];
}

export function buildPageTitleMap(
  pages: CrawledPage[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const page of pages ?? []) {
    map.set(normalizeSourcePageUrl(page.url), page.title);
  }
  return map;
}

export function groupMatchesByPage(
  matches: BlockMatchResult[],
  pageTitles?: Map<string, string>,
): PageMatchGroup[] {
  const groups = new Map<string, BlockMatchResult[]>();

  for (const match of matches) {
    const key = normalizeSourcePageUrl(match.pageUrl);
    const existing = groups.get(key) ?? [];
    existing.push(match);
    groups.set(key, existing);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([normalizedUrl, pageMatches]) => {
      const pageUrl = pageMatches[0]?.pageUrl ?? normalizedUrl;
      return {
        pageUrl,
        normalizedUrl,
        pageTitle: pageTitles?.get(normalizedUrl),
        matches: pageMatches,
      };
    });
}
