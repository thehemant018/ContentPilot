import { describe, expect, it } from "vitest";
import { injectMediaCleanup } from "@/lib/visual-mapper/media-cleanup";

describe("media-cleanup", () => {
  it("injects pause script into head", () => {
    const html = injectMediaCleanup(
      "<html><head></head><body><video autoplay loop src='/hero.mp4'></video></body></html>",
    );
    expect(html).toContain('id="migratex-media-cleanup"');
    expect(html).toContain("pauseMediaElement");
    expect(html).toContain("HTMLMediaElement.prototype.play");
  });
});
