import { describe, expect, it } from "vitest";
import {
  applyPushResultToPageProgress,
  markPagesAsPushing,
} from "@/lib/migration/ensure-target-page-client";
import { initialPageProgressItems } from "@/types/migration-page-progress";

describe("page push progress", () => {
  it("marks non-failed pages as pushing", () => {
    const items = initialPageProgressItems(
      ["/sitecore/content/A", "/sitecore/content/B"],
      ["/sitecore/content/A"],
    );
    const pushing = markPagesAsPushing(items);
    expect(pushing[0]?.status).toBe("pushing");
    expect(pushing[1]?.status).toBe("pushing");
  });

  it("applies push results per target page", () => {
    const items = markPagesAsPushing(
      initialPageProgressItems(["/sitecore/content/A"], []),
    );
    const updated = applyPushResultToPageProgress(items, [
      { targetPagePath: "/sitecore/content/A" },
    ]);
    expect(updated[0]?.status).toBe("done");
  });
});
