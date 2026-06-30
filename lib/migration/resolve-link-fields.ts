import {
  deriveSitecorePathFromInternalUrl,
  formatSitecoreGeneralLink,
  isLinkField,
  parseLinkFieldValue,
  type ParsedLinkField,
} from "@/lib/migration/link-field";
import { getSitecoreItemByPath } from "@/lib/sitecore/item-lookup";
import type { MigrationComponentExport } from "@/types/migration-export";

export interface ResolveLinkFieldsResult {
  fields: Record<string, string>;
  resolvedCount: number;
  fallbackExternalCount: number;
  warnings: string[];
}

async function resolveInternalLinkItemId(
  instanceUrl: string,
  accessToken: string,
  link: ParsedLinkField,
  targetPagePath: string,
): Promise<string | null> {
  const urlPath = link.path ?? (() => {
    try {
      return new URL(link.url).pathname;
    } catch {
      return link.url;
    }
  })();

  const candidatePath = deriveSitecorePathFromInternalUrl(
    urlPath,
    targetPagePath,
  );
  const item = await getSitecoreItemByPath(
    instanceUrl,
    accessToken,
    candidatePath,
  );
  return item?.itemId ?? null;
}

export async function resolveLinkFieldsForComponent(
  instanceUrl: string,
  accessToken: string,
  component: MigrationComponentExport,
): Promise<ResolveLinkFieldsResult> {
  const fields = { ...component.datasource.fields };
  const warnings: string[] = [];
  let resolvedCount = 0;
  let fallbackExternalCount = 0;

  for (const meta of component.datasource.fieldMeta) {
    const raw = fields[meta.name];
    if (!raw || !isLinkField(meta.name, meta.type)) {
      continue;
    }

    if (raw.trim().startsWith("<link")) {
      continue;
    }

    const parsed = parseLinkFieldValue(raw, component.sourcePageUrl);
    if (!parsed) {
      warnings.push(
        `Link field "${meta.name}" could not be parsed; left unchanged.`,
      );
      continue;
    }

    if (parsed.linkType === "internal") {
      const itemId = await resolveInternalLinkItemId(
        instanceUrl,
        accessToken,
        parsed,
        component.targetPagePath,
      );

      if (itemId) {
        fields[meta.name] = formatSitecoreGeneralLink(parsed, itemId);
        resolvedCount += 1;
        continue;
      }

      warnings.push(
        `Internal link "${parsed.path ?? parsed.url}" in field "${meta.name}" was not found in Sitecore; saved as external URL.`,
      );
      fields[meta.name] = formatSitecoreGeneralLink({
        ...parsed,
        linkType: "external",
      });
      fallbackExternalCount += 1;
      continue;
    }

    fields[meta.name] = formatSitecoreGeneralLink(parsed);
    resolvedCount += 1;
  }

  return { fields, resolvedCount, fallbackExternalCount, warnings };
}
