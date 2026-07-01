import { sitecoreApiFetch } from "@/lib/sitecore/api-client";
import type { TargetPageValidation } from "@/lib/migration/target-page";

export interface ValidateTargetPagesResponse {
  results: TargetPageValidation[];
  missingCount: number;
  existingCount: number;
  missingPaths: string[];
  existingPaths: string[];
  error?: string;
}

export async function validateTargetPages(
  paths: string[],
): Promise<ValidateTargetPagesResponse> {
  const response = await sitecoreApiFetch("/api/migration/validate-target-pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });

  const payload = (await response.json()) as ValidateTargetPagesResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to validate target pages.");
  }

  return payload;
}

export function uniqueTargetPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of paths) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
