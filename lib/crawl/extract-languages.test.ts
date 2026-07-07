import { describe, expect, it } from "vitest";
import { extractPageLanguages } from "@/lib/crawl/extract-languages";

describe("extractPageLanguages", () => {
  it("captures hreflang alternate URLs", () => {
    const html = `
      <html lang="en">
        <head>
          <link rel="alternate" hreflang="en" href="/en/overview" />
          <link rel="alternate" hreflang="fr-FR" href="/fr/overview" />
        </head>
        <body><h1>Overview</h1></body>
      </html>
    `;

    const result = extractPageLanguages(
      html,
      "https://www.example.com/en/overview",
    );

    expect(result.alternateUrls?.["fr-FR"]).toBe(
      "https://www.example.com/fr/overview",
    );
  });
});
