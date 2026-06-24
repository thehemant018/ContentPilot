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
};

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
    });
  };

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
    addMapping("image", image.src);
  }

  const link = block.links[0];
  if (link) {
    addMapping("link", link.text || link.href);
  }

  return mappings.slice(0, 4);
}
