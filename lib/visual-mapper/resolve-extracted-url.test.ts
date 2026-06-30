import { describe, expect, it } from "vitest";
import {
  resolveNavigationHref,
  unwrapProxiedUrl,
} from "@/lib/visual-mapper/resolve-extracted-url";

describe("resolve-extracted-url", () => {
  const pageUrl = "https://www.seismic.com/platform/overview/";

  it("unwraps proxy-asset URLs", () => {
    const proxied =
      "http://localhost:3000/api/proxy-asset?url=" +
      encodeURIComponent("https://assets.seismic.com/hero.png");
    expect(unwrapProxiedUrl(proxied)).toBe("https://assets.seismic.com/hero.png");
  });

  it("resolves relative CTA href against source page", () => {
    expect(resolveNavigationHref("/get-a-demo", pageUrl)).toBe(
      "https://www.seismic.com/get-a-demo",
    );
  });

  it("returns actual link from proxied href", () => {
    const proxied =
      "http://localhost:3000/api/proxy-asset?url=" +
      encodeURIComponent("https://www.seismic.com/get-a-demo");
    expect(resolveNavigationHref(proxied, pageUrl)).toBe(
      "https://www.seismic.com/get-a-demo",
    );
  });
});
