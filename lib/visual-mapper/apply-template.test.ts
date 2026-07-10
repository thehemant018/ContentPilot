import { describe, expect, it } from "vitest";
import {
  applyTemplateToHtml,
  buildPageMappingTemplate,
  parseUrlList,
} from "@/lib/visual-mapper/apply-template";
import { componentTemplateKey } from "@/lib/visual-mapper/template-key";
import type { MappingEntry } from "@/types/visual-mapper";

const TEMPLATE_HTML = `
<html>
  <head><title>Blog Post Two</title></head>
  <body>
    <section class="hero">
      <h1 class="title">Second Post Title</h1>
      <p class="summary">Short summary text.</p>
      <a class="cta" href="/en.contact-us">Contact</a>
    </section>
    <article class="body">
      <p>Main article body content here.</p>
    </article>
  </body>
</html>
`;

function sampleMappings(): MappingEntry[] {
  const templateKey = componentTemplateKey("Blog Hero", "section.hero");
  return [
    {
      id: "map-1",
      templateKey,
      sourceSelector: "section.hero",
      sourcePageUrl: "https://example.com/blog/post-one",
      renderingName: "Blog Hero",
      renderingPath: "/sitecore/layout/Renderings/Blog/Hero",
      templateName: "Blog Hero",
      templatePath: "/sitecore/templates/Blog/Hero",
      fieldAssignments: [
        {
          sitecoreField: "Title",
          fieldType: "Single-Line Text",
          sourceSelector: "h1.title",
          value: "First Post",
          valuePreview: "First Post",
          assignedManually: true,
        },
        {
          sitecoreField: "Summary",
          fieldType: "Single-Line Text",
          sourceSelector: "p.summary",
          value: "First summary",
          valuePreview: "First summary",
          assignedManually: true,
        },
        {
          sitecoreField: "CTA Link",
          fieldType: "General Link",
          sourceSelector: "a.cta",
          value: "",
          valuePreview: "",
          assignedManually: true,
        },
      ],
      createdAt: new Date(),
    },
    {
      id: "map-2",
      templateKey: componentTemplateKey("Blog Body", "article.body"),
      sourceSelector: "article.body",
      sourcePageUrl: "https://example.com/blog/post-one",
      renderingName: "Blog Body",
      renderingPath: "/sitecore/layout/Renderings/Blog/Body",
      templateName: "Blog Body",
      templatePath: "/sitecore/templates/Blog/Body",
      fieldAssignments: [
        {
          sitecoreField: "Body",
          fieldType: "Rich Text",
          sourceSelector: "article.body",
          value: "<p>First body</p>",
          valuePreview: "First body",
          assignedManually: true,
        },
      ],
      createdAt: new Date(),
    },
  ];
}

describe("apply-template", () => {
  it("builds a page mapping template from queue entries", () => {
    const template = buildPageMappingTemplate(
      sampleMappings(),
      "https://example.com/blog/post-one",
    );
    expect(template.components).toHaveLength(2);
    expect(template.components[0]?.fields).toHaveLength(3);
    expect(template.components[0]?.templateKey).toContain("Blog Hero");
  });

  it("extracts field values from similar HTML using selectors", () => {
    const template = buildPageMappingTemplate(
      sampleMappings(),
      "https://example.com/blog/post-one",
    );
    const result = applyTemplateToHtml(
      TEMPLATE_HTML,
      "https://example.com/blog/post-two",
      template,
      "/sitecore/content/Site/Home/Blog/{slug}",
    );

    expect(result.status).toBe("ok");
    expect(result.pageTitle).toBe("Blog Post Two");
    expect(result.mappings).toHaveLength(2);
    expect(result.mappings[0]?.fieldAssignments[0]?.value).toBe(
      "Second Post Title",
    );
    expect(result.targetPagePath).toBe(
      "/sitecore/content/Site/Home/Blog/post-two",
    );
    expect(result.pageName).toBe("post-two");
  });

  it("reports partial when selectors are missing", () => {
    const template = buildPageMappingTemplate(
      sampleMappings(),
      "https://example.com/blog/post-one",
    );
    const result = applyTemplateToHtml(
      `<html><body>
        <section class="hero">
          <h1 class="title">Partial title</h1>
        </section>
      </body></html>`,
      "https://example.com/blog/partial",
      template,
    );

    expect(result.status).toBe("partial");
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it("applies RTE mappings even when stored selector has broken Tailwind classes", () => {
    const mappings: MappingEntry[] = [
      {
        id: "rte-1",
        templateKey: componentTemplateKey(
          "Rich Text",
          "section.border-t.border-stone-200/80.pt-12",
        ),
        sourceSelector: "section.border-t.border-stone-200/80.pt-12",
        sourcePageUrl: "https://example.com/blog/post-one",
        renderingName: "Rich Text",
        renderingPath: "/sitecore/layout/Renderings/Blog/RichText",
        templateName: "RichText",
        templatePath: "/sitecore/templates/Blog/RichText",
        fieldAssignments: [
          {
            sitecoreField: "Text",
            fieldType: "Rich Text",
            sourceSelector: "section.border-t.border-stone-200/80.pt-12",
            value: "<p>First</p>",
            valuePreview: "First",
            assignedManually: true,
          },
        ],
        createdAt: new Date(),
      },
    ];

    const template = buildPageMappingTemplate(
      mappings,
      "https://example.com/blog/post-one",
    );
    const result = applyTemplateToHtml(
      `<html><body>
        <article>
          <section data-component="blog-rte" class="border-t border-stone-200/80 pt-12" aria-label="Article body">
            <div class="rte mt-12"><p>Second post body with <strong>markup</strong>.</p></div>
          </section>
        </article>
      </body></html>`,
      "https://example.com/blog/post-two",
      template,
    );

    expect(result.status).toBe("ok");
    expect(result.mappings[0]?.fieldAssignments[0]?.value).toContain(
      "Second post body",
    );
  });

  it("parses URL lists from textarea input", () => {
    const urls = parseUrlList(
      "https://a.com/1\n# comment\n\nhttps://b.com/2\nhttps://a.com/1",
    );
    expect(urls).toEqual(["https://a.com/1", "https://b.com/2"]);
  });
});
