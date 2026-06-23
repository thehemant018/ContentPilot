import fs from "node:fs/promises";
import path from "node:path";
import {
  buildComponentExport,
  groupPresentationByPage,
  pageFileKey,
} from "@/lib/migration/build-export";
import type {
  MigrationComponentExport,
  MigrationExportManifest,
  MigrationExportResult,
} from "@/types/migration-export";
import type { MigrationQueueItem } from "@/types/migration-queue";

const DATA_ROOT = path.join(process.cwd(), "data", "migrations");

function createBatchId(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function getMigrationDataRoot(): string {
  return DATA_ROOT;
}

export async function exportQueueToLocalData(
  queue: MigrationQueueItem[],
): Promise<MigrationExportResult> {
  if (queue.length === 0) {
    return {
      success: false,
      message: "Migration queue is empty.",
    };
  }

  const exportedAt = new Date().toISOString();
  const batchId = createBatchId(new Date(exportedAt));
  const batchDir = path.join(DATA_ROOT, batchId);
  const componentsDir = path.join(batchDir, "components");
  const pagesDir = path.join(batchDir, "pages");

  const skipped: Array<{ queueItemId: string; reason: string }> = [];
  const components: MigrationComponentExport[] = [];
  const indexByPage = new Map<string, number>();

  for (const item of queue) {
    const pageIndex = indexByPage.get(item.targetPagePath.trim()) ?? 0;
    const built = buildComponentExport(item, pageIndex, exportedAt);

    if (!built) {
      skipped.push({
        queueItemId: item.id,
        reason: "Target Sitecore page path is required.",
      });
      continue;
    }

    indexByPage.set(item.targetPagePath.trim(), pageIndex + 1);
    components.push(built);
  }

  if (components.length === 0) {
    return {
      success: false,
      message:
        "No components exported. Set a target Sitecore page path for each queued item.",
      skipped,
    };
  }

  const componentFiles: string[] = [];
  for (const component of components) {
    const relativePath = path.join(
      "components",
      `${component.queueItemId}.json`,
    );
    componentFiles.push(relativePath);
    await writeJson(path.join(batchDir, relativePath), component);
  }

  const pageExports = groupPresentationByPage(components);
  const pageFiles: string[] = [];

  for (const pageExport of pageExports) {
    const relativePath = path.join(
      "pages",
      `${pageFileKey(pageExport.targetPagePath)}.json`,
    );
    pageFiles.push(relativePath);
    await writeJson(path.join(batchDir, relativePath), pageExport);
  }

  const manifest: MigrationExportManifest = {
    batchId,
    exportedAt,
    componentCount: components.length,
    pageCount: pageExports.length,
    components: componentFiles,
    pages: pageFiles,
  };

  await writeJson(path.join(batchDir, "manifest.json"), manifest);
  await writeJson(path.join(DATA_ROOT, "latest.json"), {
    batchId,
    exportedAt,
    batchDir: path.relative(process.cwd(), batchDir),
    manifest,
  });

  const skippedNote =
    skipped.length > 0 ? ` ${skipped.length} item(s) skipped (missing target path).` : "";

  return {
    success: true,
    message: `Exported ${components.length} component(s) across ${pageExports.length} page(s) to data/migrations/${batchId}.${skippedNote}`,
    batchId,
    outputDir: path.relative(process.cwd(), batchDir),
    manifest,
    skipped: skipped.length > 0 ? skipped : undefined,
  };
}

export async function readLatestExportSummary(): Promise<{
  batchId: string;
  exportedAt: string;
  batchDir: string;
  manifest: MigrationExportManifest;
} | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_ROOT, "latest.json"), "utf8");
    return JSON.parse(raw) as {
      batchId: string;
      exportedAt: string;
      batchDir: string;
      manifest: MigrationExportManifest;
    };
  } catch {
    return null;
  }
}
