import { sitecoreApiFetch } from "@/lib/sitecore/api-client";
import {
  countPageProgress,
  initialPageProgressItems,
  updatePageProgressItem,
  type TargetPageProgressItem,
} from "@/types/migration-page-progress";

export interface EnsureTargetPagesProgressOptions {
  paths: string[];
  existingPaths?: string[];
  pageTemplatePath?: string;
  sxaPageDataTemplatePath?: string;
  language?: string;
  onProgress: (items: TargetPageProgressItem[]) => void;
}

interface EnsureTargetPagesBatchResult {
  error?: string;
  success?: boolean;
  results?: Array<{
    path: string;
    resolvedPath: string;
    created: boolean;
    error?: string;
  }>;
}

export async function ensureTargetPagesWithProgress(
  options: EnsureTargetPagesProgressOptions,
): Promise<{ success: boolean; items: TargetPageProgressItem[] }> {
  let items = initialPageProgressItems(
    options.paths,
    options.existingPaths ?? [],
  );
  options.onProgress(items);

  const pathsToCreate = options.paths.filter((path) => {
    const current = items.find((item) => item.path === path);
    return current && current.status !== "existing";
  });

  if (pathsToCreate.length === 0) {
    return { success: true, items };
  }

  for (const path of pathsToCreate) {
    items = updatePageProgressItem(items, path, {
      status: "creating",
      detail: undefined,
    });
  }
  options.onProgress(items);

  try {
    const response = await sitecoreApiFetch("/api/migration/ensure-target-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paths: pathsToCreate,
        pageTemplatePath: options.pageTemplatePath,
        sxaPageDataTemplatePath: options.sxaPageDataTemplatePath,
        language: options.language,
      }),
    });

    const payload = (await response.json()) as EnsureTargetPagesBatchResult;

    if (!response.ok) {
      for (const path of pathsToCreate) {
        items = updatePageProgressItem(items, path, {
          status: "failed",
          detail: payload.error ?? "Failed to create page.",
        });
      }
      options.onProgress(items);
      return { success: false, items };
    }

    const resultByPath = new Map(
      (payload.results ?? []).map((entry) => [entry.path, entry]),
    );

    for (const path of pathsToCreate) {
      const entry = resultByPath.get(path);
      if (!entry) {
        items = updatePageProgressItem(items, path, {
          status: "failed",
          detail: "No result returned for this page.",
        });
        continue;
      }

      if (entry.error) {
        items = updatePageProgressItem(items, path, {
          status: "failed",
          detail: entry.error,
        });
        continue;
      }

      items = updatePageProgressItem(items, path, {
        path: entry.resolvedPath || path,
        status: entry.created ? "created" : "existing",
        detail: entry.created ? "New page created" : "Page already existed",
      });
    }

    options.onProgress(items);
    const failed = items.some((item) => item.status === "failed");
    return { success: !failed && payload.success !== false, items };
  } catch (error) {
    for (const path of pathsToCreate) {
      items = updatePageProgressItem(items, path, {
        status: "failed",
        detail:
          error instanceof Error ? error.message : "Failed to create page.",
      });
    }
    options.onProgress(items);
    return { success: false, items };
  }
}

export function markPagesAsPushing(
  items: TargetPageProgressItem[],
): TargetPageProgressItem[] {
  return items.map((item) =>
    item.status === "failed"
      ? item
      : { ...item, status: "pushing", detail: "Pushing content…" },
  );
}

export function applyPushResultToPageProgress(
  items: TargetPageProgressItem[],
  results: Array<{ targetPagePath?: string; error?: string }>,
): TargetPageProgressItem[] {
  return items.map((item) => {
    if (item.status === "failed") {
      return item;
    }

    const pageResults = results.filter(
      (entry) => entry.targetPagePath === item.path,
    );

    if (pageResults.length === 0) {
      return { ...item, status: "done", detail: "Content pushed" };
    }

    const failed = pageResults.find((entry) => entry.error);
    if (failed) {
      return {
        ...item,
        status: "failed",
        detail: failed.error ?? "Push failed for this page.",
      };
    }

    return { ...item, status: "done", detail: "Content pushed" };
  });
}

export function pageProgressSummary(items: TargetPageProgressItem[]): string {
  const done = countPageProgress(items, ["done", "existing", "created"]);
  const failed = countPageProgress(items, ["failed"]);
  const total = items.length;
  if (failed > 0) {
    return `${done}/${total} pages ready, ${failed} failed.`;
  }
  return `${done}/${total} pages completed.`;
}
