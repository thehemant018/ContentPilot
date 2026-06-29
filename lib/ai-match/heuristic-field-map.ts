import { inferMatchingBlockType } from "@/lib/ai-match/block-intent";
import type { FieldMapping, FlatContentBlock } from "@/types/ai-match";
import type {
  TemplateDefinition,
  TemplateFieldDefinition,
} from "@/types/discovery";

const REGION_LABELS = {
  heading: "heading",
  text: "body text",
  image: "image",
  link: "link/cta",
  author: "author",
  authorMeta: "author metadata",
  description: "description",
} as const;

const FIELD_NAME_PATTERNS: Record<keyof typeof REGION_LABELS, RegExp[]> = {
  heading: [
    /\btitle\b/i,
    /\bheadline\b/i,
    /\bheading\b/i,
    /\bsubtitle\b/i,
    /\bteaser\b/i,
  ],
  text: [
    /\bbody\b/i,
    /\btext\b/i,
    /\bcontent\b/i,
    /\bdescription\b/i,
    /\bsummary\b/i,
    /\bcopy\b/i,
    /\brte\b/i,
  ],
  image: [
    /\bimage\b/i,
    /\bphoto\b/i,
    /\bmedia\b/i,
    /\bthumbnail\b/i,
    /\bpicture\b/i,
    /\bbanner\b/i,
  ],
  link: [/\blink\b/i, /\bcta\b/i, /\bbutton\b/i, /\burl\b/i, /\btarget\b/i],
  author: [
    /\bauthor\b/i,
    /\bbyline\b/i,
    /\bwriter\b/i,
    /\bpostedby\b/i,
    /\bname\b/i,
  ],
  authorMeta: [
    /\bjobtitle\b/i,
    /\bposition\b/i,
    /\brole\b/i,
    /\bdesignation\b/i,
    /\btitle\b/i,
  ],
  description: [
    /\bdescription\b/i,
    /\bsummary\b/i,
    /\babstract\b/i,
    /\bmeta\b/i,
  ],
};

const VIDEO_URL_FIELD_PATTERNS = [
  /\bvideo\b/i,
  /\byoutube\b/i,
  /\bembed\b/i,
  /\burl\b/i,
  /\bsource\b/i,
];

const QUOTE_BODY_FIELD_PATTERNS = [
  /\bquote\b/i,
  /\btext\b/i,
  /\bbody\b/i,
  /\bcontent\b/i,
  /\bdescription\b/i,
];

function extractVideoEmbedUrl(htmlSnippet: string): string | undefined {
  const match = htmlSnippet.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim();
}

function extractAuthorFromHtml(htmlSnippet: string): string | undefined {
  const figcaptionName = htmlSnippet.match(
    /<figcaption[^>]*>[\s\S]*?<span[^>]*class=["'][^"']*\b(?:font-semibold|author|name)[^"']*["'][^>]*>([^<]+)</i,
  );
  if (figcaptionName?.[1]) {
    return figcaptionName[1].replace(/\s+/g, " ").trim();
  }

  const itempropMatch = htmlSnippet.match(
    /itemprop=["']author["'][^>]*>([^<]+)</i,
  );
  if (itempropMatch?.[1]) {
    return itempropMatch[1].replace(/\s+/g, " ").trim();
  }

  const classMatch = htmlSnippet.match(
    /<[^>]+class=["'][^"']*\bauthor[^"']*["'][^>]*>([^<]+)</i,
  );
  if (classMatch?.[1]) {
    return classMatch[1].replace(/\s+/g, " ").trim();
  }

  const bylineMatch = htmlSnippet.match(
    /<[^>]+class=["'][^"']*\b(byline|writer|posted-by)[^"']*["'][^>]*>([^<]+)</i,
  );
  return bylineMatch?.[2]?.replace(/\s+/g, " ").trim();
}

function extractAuthorMetaFromHtml(htmlSnippet: string): string | undefined {
  const figcaptionRole = htmlSnippet.match(
    /<figcaption[^>]*>[\s\S]*?<span[^>]*class=["'][^"']*\b(?:text-xs|job|role|position)[^"']*["'][^>]*>([^<]+)</i,
  );
  if (figcaptionRole?.[1]) {
    return figcaptionRole[1].replace(/\s+/g, " ").trim();
  }

  const itempropMatch = htmlSnippet.match(
    /itemprop=["'](?:jobTitle|role)["'][^>]*>([^<]+)</i,
  );
  if (itempropMatch?.[1]) {
    return itempropMatch[1].replace(/\s+/g, " ").trim();
  }

  const classMatch = htmlSnippet.match(
    /<[^>]+class=["'][^"']*\b(job-title|position|role|designation)[^"']*["'][^>]*>([^<]+)</i,
  );
  return classMatch?.[2]?.replace(/\s+/g, " ").trim();
}

function extractBlockquoteText(htmlSnippet: string): string | undefined {
  const match = htmlSnippet.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
  if (!match?.[1]) {
    return undefined;
  }

  return match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function findFieldByPatterns(
  fields: TemplateFieldDefinition[],
  patterns: RegExp[],
  used: Set<string>,
): TemplateFieldDefinition | undefined {
  return fields.find(
    (field) =>
      !used.has(field.name) &&
      patterns.some((pattern) => pattern.test(field.name)),
  );
}

function extractSectionIntro(htmlSnippet: string): string | undefined {
  const paragraphMatch = htmlSnippet.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!paragraphMatch?.[1]) {
    return undefined;
  }

  return paragraphMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function buildHeuristicFieldMappings(
  block: FlatContentBlock,
  template: TemplateDefinition | undefined,
): FieldMapping[] {
  if (!template || template.fields.length === 0) {
    return [];
  }

  const used = new Set<string>();
  const mappings: FieldMapping[] = [];

  const addMapping = (
    region: keyof typeof REGION_LABELS,
    preview: string,
    imageAlt?: string,
  ): void => {
    const trimmed = preview.trim();
    if (!trimmed) {
      return;
    }

    const field = findFieldByPatterns(
      template.fields,
      FIELD_NAME_PATTERNS[region],
      used,
    );
    if (!field) {
      return;
    }

    used.add(field.name);
    mappings.push({
      sourceRegion: REGION_LABELS[region],
      sourcePreview:
        region === "image" ? trimmed : trimmed.slice(0, 80),
      sitecoreField: field.name,
      fieldType: field.type,
      section: field.section,
      imageAlt: region === "image" ? imageAlt?.trim() || undefined : undefined,
    });
  };

  if (block.matchRole === "section-container") {
    if (block.heading) {
      addMapping("heading", block.heading);
    }

    const intro =
      extractSectionIntro(block.htmlSnippet) ??
      block.text.replace(block.heading ?? "", "").trim();
    if (intro) {
      addMapping("description", intro);
    }

    return mappings;
  }

  if (block.heading) {
    addMapping("heading", block.heading);
  }

  const bodyText = block.text.trim();
  if (bodyText && bodyText !== block.heading?.trim()) {
    addMapping("text", bodyText);
  } else if (bodyText && !block.heading) {
    addMapping("text", bodyText);
  }

  const image = block.images[0];
  if (image?.src) {
    addMapping("image", image.src, image.alt);
  }

  const link = block.links[0];
  if (link) {
    addMapping("link", link.text || link.href);
  }

  const intent = inferMatchingBlockType(block);
  if (intent === "video") {
    const embedUrl = extractVideoEmbedUrl(block.htmlSnippet);
    if (embedUrl) {
      const field = findFieldByPatterns(
        template.fields,
        VIDEO_URL_FIELD_PATTERNS,
        used,
      );
      if (field) {
        used.add(field.name);
        mappings.push({
          sourceRegion: "video embed",
          sourcePreview: embedUrl,
          sitecoreField: field.name,
          fieldType: field.type,
          section: field.section,
        });
      }
    }
  }

  if (intent === "quote") {
    const quoteText = extractBlockquoteText(block.htmlSnippet);
    if (quoteText) {
      let field = findFieldByPatterns(
        template.fields,
        QUOTE_BODY_FIELD_PATTERNS,
        used,
      );
      if (!field) {
        field = findFieldByPatterns(
          template.fields,
          FIELD_NAME_PATTERNS.heading,
          used,
        );
      }
      if (field) {
        used.add(field.name);
        mappings.push({
          sourceRegion: "blockquote",
          sourcePreview: quoteText.slice(0, 120),
          sitecoreField: field.name,
          fieldType: field.type,
          section: field.section,
        });
      }
    }
  }

  const author = extractAuthorFromHtml(block.htmlSnippet);
  if (author) {
    addMapping("author", author);
  }

  const authorMeta = extractAuthorMetaFromHtml(block.htmlSnippet);
  if (authorMeta) {
    addMapping("authorMeta", authorMeta);
  }

  return mappings.slice(0, 8);
}
