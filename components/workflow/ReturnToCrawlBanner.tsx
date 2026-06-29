"use client";

import { useEffect, useState } from "react";
import { ReturnToMappingSourceButton } from "@/components/workflow/ReturnToMappingSourceButton";
import {
  getMappingSourceBackTarget,
  type MappingSourceBackTarget,
} from "@/lib/workflow/migration-mode";
import { subscribeWorkflowProgress } from "@/lib/workflow/progress";

export function ReturnToCrawlBanner() {
  const [target, setTarget] = useState<MappingSourceBackTarget>(() =>
    getMappingSourceBackTarget(),
  );

  useEffect(() => {
    function refresh() {
      setTarget(getMappingSourceBackTarget());
    }

    queueMicrotask(refresh);
    return subscribeWorkflowProgress(refresh);
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
      <p className="text-sm text-blue-900">{target.description}</p>
      <ReturnToMappingSourceButton
        variant="button"
        intent="back"
        label={target.label}
      />
    </div>
  );
}
