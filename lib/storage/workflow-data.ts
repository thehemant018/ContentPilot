import { clearMigrationQueue } from "@/lib/storage/migration-queue";
import { STORAGE_KEYS } from "@/lib/sitecore/constants";
import {
  slimDiscoveryResult,
  type LegacyDiscoveryResult,
} from "@/lib/sitecore/discovery/slim-result";
import type { CrawlResult } from "@/types/crawl";
import type { DiscoveryResult } from "@/types/discovery";
import type { AiMatchResult } from "@/types/ai-match";

export const WORKFLOW_DATA_CHANGED_EVENT = "migratex-workflow-data-changed";

export function saveDiscoveryResult(result: DiscoveryResult): void {
  if (!result.success) {
    return;
  }
  localStorage.setItem(
    STORAGE_KEYS.discoveryResult,
    JSON.stringify(slimDiscoveryResult(result)),
  );
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
    const parsed = JSON.parse(raw) as LegacyDiscoveryResult;
    const slimmed = slimDiscoveryResult(parsed);
    if (parsed.media !== undefined) {
      localStorage.setItem(
        STORAGE_KEYS.discoveryResult,
        JSON.stringify(slimmed),
      );
    }
    return slimmed;
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

/** Clears map → migrate workflow data while keeping auth and discovery. */
export function clearPostDiscoveryWorkflowData(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(STORAGE_KEYS.crawlResult);
  localStorage.removeItem(STORAGE_KEYS.aiMatchResult);
  clearMigrationQueue();
  window.dispatchEvent(new Event(WORKFLOW_DATA_CHANGED_EVENT));
}

export function clearDownstreamOfCrawlData(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(STORAGE_KEYS.aiMatchResult);
  clearMigrationQueue();
  window.dispatchEvent(new Event(WORKFLOW_DATA_CHANGED_EVENT));
}

export function clearWorkflowData(): void {
  localStorage.removeItem(STORAGE_KEYS.discoveryResult);
  localStorage.removeItem(STORAGE_KEYS.crawlResult);
  localStorage.removeItem(STORAGE_KEYS.aiMatchResult);
  clearMigrationQueue();
  window.dispatchEvent(new Event(WORKFLOW_DATA_CHANGED_EVENT));
}

/** Clears crawl → migrate data while keeping auth, discovery, and LLM config. */
export function clearContentMigrationData(): void {
  localStorage.removeItem(STORAGE_KEYS.crawlResult);
  localStorage.removeItem(STORAGE_KEYS.aiMatchResult);
  clearMigrationQueue();
  window.dispatchEvent(new Event(WORKFLOW_DATA_CHANGED_EVENT));
}
