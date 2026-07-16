import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/migration/concurrency";

describe("mapWithConcurrency", () => {
  it("preserves input order with limited concurrency", async () => {
    const started: number[] = [];
    const maxConcurrent = { value: 0 };
    let inFlight = 0;

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      started.push(value);
      inFlight += 1;
      maxConcurrent.value = Math.max(maxConcurrent.value, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return value * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxConcurrent.value).toBeLessThanOrEqual(2);
    expect(started).toHaveLength(5);
  });

  it("returns an empty array for empty input", async () => {
    await expect(mapWithConcurrency([], 4, async (value) => value)).resolves.toEqual(
      [],
    );
  });
});
