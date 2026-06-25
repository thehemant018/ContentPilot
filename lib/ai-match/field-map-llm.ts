import { buildHeuristicFieldMappings } from "@/lib/ai-match/heuristic-field-map";
import type {
  FieldMapping,
  FlatContentBlock,
  MatchConfidence,
} from "@/types/ai-match";
import type { TemplateDefinition } from "@/types/discovery";

export interface RawLlmFieldMapping {
  sitecoreField: string;
  sourceValue: string;
  sourceRegion?: string;
  confidence?: MatchConfidence;
  imageAlt?: string;
}

export interface RawLlmFieldBlockResult {
  blockId: string;
  mappings?: RawLlmFieldMapping[];
}

export interface RawLlmFieldMappingResponse {
  blocks?: RawLlmFieldBlockResult[];
}

export const FIELD_MAPPING_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          blockId: { type: "string" },
          mappings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sitecoreField: { type: "string" },
                sourceValue: { type: "string" },
                sourceRegion: { type: "string" },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
                imageAlt: { type: "string" },
              },
              required: ["sitecoreField", "sourceValue", "confidence"],
            },
          },
        },
        required: ["blockId", "mappings"],
      },
    },
  },
  required: ["blocks"],
} as const;

function findTemplateField(
  template: TemplateDefinition,
  fieldName: string,
) {
  const normalized = fieldName.trim().toLowerCase();
  return template.fields.find(
    (field) => field.name.toLowerCase() === normalized,
  );
}

function resolveImageAlt(
  block: FlatContentBlock,
  sourceValue: string,
  imageAlt?: string,
): string | undefined {
  const trimmedAlt = imageAlt?.trim();
  if (trimmedAlt) {
    return trimmedAlt;
  }

  const matchedImage = block.images.find(
    (image) => image.src === sourceValue || sourceValue.includes(image.src),
  );
  return matchedImage?.alt?.trim() || undefined;
}

export function parseLlmFieldMappingsForBlock(
  block: FlatContentBlock,
  template: TemplateDefinition,
  rawMappings: RawLlmFieldMapping[] | undefined,
): FieldMapping[] {
  if (!rawMappings?.length) {
    return [];
  }

  const used = new Set<string>();
  const results: FieldMapping[] = [];

  for (const raw of rawMappings) {
    const sourceValue = raw.sourceValue?.trim();
    if (!sourceValue) {
      continue;
    }

    const field = findTemplateField(template, raw.sitecoreField);
    if (!field || used.has(field.name)) {
      continue;
    }

    used.add(field.name);
    const isImageField = /image|media|photo|picture|thumbnail/i.test(field.type);

    results.push({
      sourceRegion: raw.sourceRegion?.trim() || "llm extraction",
      sourcePreview: isImageField
        ? sourceValue
        : sourceValue.slice(0, 120),
      sitecoreField: field.name,
      fieldType: field.type,
      section: field.section,
      imageAlt: isImageField
        ? resolveImageAlt(block, sourceValue, raw.imageAlt)
        : undefined,
    });
  }

  return results;
}

export function resolveFieldMappings(
  block: FlatContentBlock,
  template: TemplateDefinition | undefined,
  llmMappings: FieldMapping[] | undefined,
): FieldMapping[] {
  if (llmMappings && llmMappings.length > 0) {
    return llmMappings;
  }

  return buildHeuristicFieldMappings(block, template);
}

export function mergeFieldMappingResults(
  matches: Array<{ blockId: string; fieldMappings: FieldMapping[] }>,
  blockMap: Map<string, FlatContentBlock>,
  templateByBlockId: Map<string, TemplateDefinition | undefined>,
  llmByBlockId: Map<string, FieldMapping[]>,
  blockIdsToUpdate: Set<string>,
): void {
  for (const match of matches) {
    if (!blockIdsToUpdate.has(match.blockId)) {
      continue;
    }

    const block = blockMap.get(match.blockId);
    const template = templateByBlockId.get(match.blockId);
    if (!block || !template) {
      continue;
    }

    match.fieldMappings = resolveFieldMappings(
      block,
      template,
      llmByBlockId.get(match.blockId),
    );
  }
}
