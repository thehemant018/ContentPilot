import { clearMigrationQueue } from "@/lib/storage/migration-queue";
import { STORAGE_KEYS } from "@/lib/sitecore/constants";
import type { CrawlResult } from "@/types/crawl";
import type { DiscoveryResult } from "@/types/discovery";
import type { AiMatchResult } from "@/types/ai-match";

export const WORKFLOW_DATA_CHANGED_EVENT = "migratex-workflow-data-changed";

export function saveDiscoveryResult(result: DiscoveryResult): void {
  if (!result.success) {
    return;
  }
  localStorage.setItem(STORAGE_KEYS.discoveryResult, JSON.stringify(result));
  window.dispatchEvent(new Event(WORKFLOW_DATA_CHANGED_EVENT));
}

export function getDiscoveryResult(): DiscoveryResult | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(STORAGE_KEYS.discoveryResult);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as DiscoveryResult;
  } catch {
    return null;
  }
}

export function saveCrawlResult(result: CrawlResult): void {
  if (!result.success) {
    return;
  }
  localStorage.setItem(STORAGE_KEYS.crawlResult, JSON.stringify(result));
  window.dispatchEvent(new Event(WORKFLOW_DATA_CHANGED_EVENT));
}

export function getCrawlResult(): CrawlResult | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(STORAGE_KEYS.crawlResult);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as CrawlResult;
  } catch {
    return null;
  }
}

export function saveAiMatchResult(result: AiMatchResult): void {
  if (!result.success) {
    return;
  }
  localStorage.setItem(STORAGE_KEYS.aiMatchResult, JSON.stringify(result));
  window.dispatchEvent(new Event(WORKFLOW_DATA_CHANGED_EVENT));
}

export function getAiMatchResult(): AiMatchResult | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(STORAGE_KEYS.aiMatchResult);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AiMatchResult;
  } catch {
    return null;
  }
}

export function clearWorkflowData(): void {
  localStorage.removeItem(STORAGE_KEYS.discoveryResult);
  localStorage.removeItem(STORAGE_KEYS.crawlResult);
  localStorage.removeItem(STORAGE_KEYS.aiMatchResult);
  clearMigrationQueue();
  window.dispatchEvent(new Event(WORKFLOW_DATA_CHANGED_EVENT));
}
