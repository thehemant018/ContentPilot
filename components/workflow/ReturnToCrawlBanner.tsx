"use client";

import { ReturnToCrawlButton } from "@/components/workflow/ReturnToCrawlButton";

export function ReturnToCrawlBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
      <p className="text-sm text-blue-900">
        Changed your mind about this page? Go back to Crawl and pick a different
        source URL.
      </p>
      <ReturnToCrawlButton variant="button" label="Back to Crawl" />
    </div>
  );
}
