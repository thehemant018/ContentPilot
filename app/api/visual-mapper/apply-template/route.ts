import { NextRequest, NextResponse } from "next/server";
import {
  applyTemplateToUrls,
  buildPageMappingTemplate,
} from "@/lib/visual-mapper/apply-template";
import type { SourcePageLanguage } from "@/types/language";
import type { MappingEntry, PageMappingTemplate } from "@/types/visual-mapper";

function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

interface ApplyTemplateRequestBody {
  templatePageUrl?: string;
  mappings?: MappingEntry[];
  template?: PageMappingTemplate;
  urls?: string[];
  targetPagePathPattern?: string;
  selectedLanguages?: string[];
  languages?: SourcePageLanguage;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ApplyTemplateRequestBody;
  try {
    body = (await request.json()) as ApplyTemplateRequestBody;
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const urls = (body.urls ?? [])
    .map((url) => url.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    return jsonError("Provide at least one URL in urls.");
  }

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return jsonError(`Unsupported URL protocol: ${url}`);
      }
    } catch {
      return jsonError(`Invalid URL: ${url}`);
    }
  }

  let template = body.template;
  if (!template) {
    const mappings = body.mappings ?? [];
    const templatePageUrl = body.templatePageUrl?.trim() ?? "";
    if (mappings.length === 0 || !templatePageUrl) {
      return jsonError(
        "Provide template or both mappings and templatePageUrl.",
      );
    }
    template = buildPageMappingTemplate(mappings, templatePageUrl, {
      selectedLanguages: body.selectedLanguages,
      languages: body.languages,
    });
  } else if (
    (body.selectedLanguages?.length || body.languages) &&
    (!template.selectedLanguages?.length || !template.languages)
  ) {
    template = {
      ...template,
      selectedLanguages:
        template.selectedLanguages?.length
          ? template.selectedLanguages
          : body.selectedLanguages,
      languages: template.languages ?? body.languages,
    };
  }

  if (template.components.length === 0) {
    return jsonError("Mapping template has no components.");
  }

  const result = await applyTemplateToUrls(
    urls,
    template,
    body.targetPagePathPattern ?? "",
  );

  return NextResponse.json(result);
}
