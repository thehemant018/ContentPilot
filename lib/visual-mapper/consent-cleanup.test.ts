import { describe, expect, it } from "vitest";
import {
  CONSENT_SELECTOR,
  injectConsentCleanup,
} from "@/lib/visual-mapper/consent-cleanup";

describe("consent-cleanup", () => {
  it("injects hide styles and cleanup script into head", () => {
    const html = injectConsentCleanup(
      "<html><head></head><body><div id='onetrust-consent-sdk'></div></body></html>",
    );
    expect(html).toContain('id="contentpilot-consent-hide"');
    expect(html).toContain("removeConsentNodes");
    expect(html).toContain("#onetrust-consent-sdk");
  });

  it("includes OneTrust and generic cookie banner selectors", () => {
    expect(CONSENT_SELECTOR).toContain("#onetrust-consent-sdk");
    expect(CONSENT_SELECTOR).toContain("#CybotCookiebotDialog");
  });
});
