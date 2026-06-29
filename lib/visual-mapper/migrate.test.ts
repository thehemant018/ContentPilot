import { describe, expect, it } from "vitest";
import { mappingEntriesToBlockMatchResults } from "@/lib/visual-mapper/migrate";
import type { MappingEntry } from "@/types/visual-mapper";
import type { BlockMatchResult } from "@/types/ai-match";

describe("mappingEntriesToBlockMatchResults", () => {
  const sampleEntry: MappingEntry = {
    id: "entry-1",
    sourceSelector: "section.hero",
    sourcePageUrl: "https://example.com/page",
    renderingName: "HeroComponent",
    renderingPath: "/sitecore/layout/Renderings/Feature/Hero",
    templateName: "Hero",
    templatePath: "/sitecore/templates/Feature/Hero",
    fieldAssignments: [
      {
        sitecoreField: "Heading",
        fieldType: "Single-Line Text",
        sourceSelector: "h1.title",
        value: "Welcome",
        valuePreview: "Welcome",
        assignedManually: true,
      },
      {
        sitecoreField: "Image",
        fieldType: "Image",
        sourceSelector: "img.hero",
        value: "https://example.com/hero.jpg",
        valuePreview: "https://example.com/hero.jpg",
        assignedManually: true,
      },
    ],
    createdAt: new Date("2026-01-01"),
  };

  it("maps MappingEntry to BlockMatchResult shape", () => {
    const results = mappingEntriesToBlockMatchResults(
      [sampleEntry],
      "https://example.com/page",
      "Example Page",
    );

    expect(results).toHaveLength(1);

    const match: BlockMatchResult = results[0];

    expect(match.blockId).toBe("entry-1");
    expect(match.pageUrl).toBe("https://example.com/page");
    expect(match.blockType).toBe("unknown");
    expect(match.blockHeading).toBe("Welcome");
    expect(match.matchScore).toBe(100);
    expect(match.confidence).toBe("high");
    expect(match.renderingName).toBe("HeroComponent");
    expect(match.renderingPath).toBe(
      "/sitecore/layout/Renderings/Feature/Hero",
    );
    expect(match.templateName).toBe("Hero");
    expect(match.templatePath).toBe("/sitecore/templates/Feature/Hero");
    expect(match.reasoning).toBe("Manually mapped by user via Visual Mapper");
    expect(match.needsReview).toBe(false);
    expect(match.fieldMappings).toHaveLength(2);
    expect(match.fieldMappings[0]).toEqual({
      sitecoreField: "Heading",
      fieldType: "Single-Line Text",
      sourceRegion: "h1.title",
      sourcePreview: "Welcome",
    });
    expect(match.fieldMappings[1]).toEqual({
      sitecoreField: "Image",
      fieldType: "Image",
      sourceRegion: "img.hero",
      sourcePreview: "https://example.com/hero.jpg",
    });
  });
});
