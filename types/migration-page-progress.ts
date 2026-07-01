export type TargetPageProgressStatus =
  | "pending"
  | "creating"
  | "created"
  | "existing"
  | "pushing"
  | "done"
  | "failed";

export interface TargetPageProgressItem {
  path: string;
  status: TargetPageProgressStatus;
  detail?: string;
}

export function initialPageProgressItems(
  allPaths: string[],
  existingPaths: string[] = [],
): TargetPageProgressItem[] {
  const existingSet = new Set(existingPaths);
  return allPaths.map((path) => ({
    path,
    status: existingSet.has(path) ? "existing" : "pending",
  }));
}

export function updatePageProgressItem(
  items: TargetPageProgressItem[],
  path: string,
  patch: Partial<TargetPageProgressItem>,
): TargetPageProgressItem[] {
  return items.map((item) =>
    item.path === path ? { ...item, ...patch } : item,
  );
}

export function countPageProgress(
  items: TargetPageProgressItem[],
  statuses: TargetPageProgressStatus[],
): number {
  return items.filter((item) => statuses.includes(item.status)).length;
}
