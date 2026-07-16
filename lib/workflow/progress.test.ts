import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/lib/sitecore/constants";
import {
  canNavigateToPhase,
  canReturnToMapModePhase,
  getDefaultPhaseFromHash,
  markDiscoveryPhaseComplete,
  markMapModePhaseComplete,
  setWorkflowPhaseIndex,
} from "@/lib/workflow/progress";
import { WORKFLOW_PHASES } from "@/lib/workflow/phases";

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("workflow map-mode navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    vi.stubGlobal("sessionStorage", createStorage());
    vi.stubGlobal("window", {
      localStorage,
      sessionStorage,
      location: { hash: "", pathname: "/" },
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    localStorage.setItem(
      STORAGE_KEYS.session,
      JSON.stringify({
        accessToken: "token",
        instanceUrl: "https://example.sitecorecloud.io",
        expiresAt: Date.now() + 60_000,
        connectedAt: new Date().toISOString(),
      }),
    );
    localStorage.setItem(STORAGE_KEYS.discoveryComplete, "true");
  });

  it("allows returning to map-mode after advancing to review", () => {
    markDiscoveryPhaseComplete();
    markMapModePhaseComplete();

    const reviewIndex = WORKFLOW_PHASES.findIndex(
      (phase) => phase.id === "review",
    );
    setWorkflowPhaseIndex(reviewIndex);

    expect(canReturnToMapModePhase()).toBe(true);
    expect(canNavigateToPhase("map-mode", reviewIndex)).toBe(true);

    window.location.hash = "#map-mode";
    expect(getDefaultPhaseFromHash()).toBe("map-mode");
  });
});
