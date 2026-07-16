import {
  clearQueueOnMapNavigation,
  returnToCrawlPhase,
} from "@/lib/workflow/progress";
import { STORAGE_KEYS } from "@/lib/sitecore/constants";

export type MigrationMode = "ai" | "visual-mapper";

export interface MappingSourceBackTarget {
  label: string;
  description: string;
  navigate: () => void;
}

export function getMigrationMode(): MigrationMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(STORAGE_KEYS.migrationMode);
  if (raw === "ai" || raw === "visual-mapper") {
    return raw;
  }
  return null;
}

export function saveMigrationMode(mode: MigrationMode): void {
  localStorage.setItem(STORAGE_KEYS.migrationMode, mode);
}

export function clearMigrationMode(): void {
  localStorage.removeItem(STORAGE_KEYS.migrationMode);
}

export function isVisualMapperMode(): boolean {
  return getMigrationMode() === "visual-mapper";
}

export function isAiMigrationMode(): boolean {
  return getMigrationMode() === "ai";
}

export function getMappingSourceBackTarget(): MappingSourceBackTarget {
  if (isVisualMapperMode()) {
    return {
      label: "Back to Visual Mapper",
      description:
        "Want to map more components? Return to Visual Mapper — the Review queue will be cleared.",
      navigate: () => {
        clearQueueOnMapNavigation();
        window.location.href = "/visual-mapper";
      },
    };
  }

  return {
    label: "Back to Crawl",
    description:
      "Changed your mind about this page? Go back to Crawl and pick a different source URL.",
    navigate: () => {
      returnToCrawlPhase();
    },
  };
}
