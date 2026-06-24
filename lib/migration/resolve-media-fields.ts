import {
  formatSitecoreImageFieldValue,
  isHttpImageFieldValue,
  resolveAbsoluteImageUrl,
  uploadImageFromUrl,
  type UploadMediaResult,
} from "@/lib/sitecore/media-upload";
import type { MigrationComponentExport } from "@/types/migration-export";

function isImageField(fieldName: string, fieldType?: string): boolean {
  if (fieldType?.toLowerCase().includes("image")) {
    return true;
  }

  return /\b(image|photo|thumbnail|picture|banner|media)\b/i.test(fieldName);
}

export interface ResolveMediaFieldsResult {
  fields: Record<string, string>;
  uploadedCount: number;
  warnings: string[];
}

export async function resolveMediaFieldsForComponent(
  instanceUrl: string,
  accessToken: string,
  component: MigrationComponentExport,
  mediaLibraryPath: string,
  uploadCache: Map<string, UploadMediaResult>,
): Promise<ResolveMediaFieldsResult> {
  const fields = { ...component.datasource.fields };
  const warnings: string[] = [];
  let uploadedCount = 0;
  const language = component.presentation.language || "en";

  for (const meta of component.datasource.fieldMeta) {
    const value = fields[meta.name];
    if (!value || !isHttpImageFieldValue(value)) {
      continue;
    }

    if (!isImageField(meta.name, meta.type)) {
      continue;
    }

    const absoluteUrl = resolveAbsoluteImageUrl(
      value,
      component.sourcePageUrl,
    );

    try {
      let uploaded = uploadCache.get(absoluteUrl);
      if (!uploaded) {
        uploaded = await uploadImageFromUrl(
          instanceUrl,
          accessToken,
          absoluteUrl,
          {
            mediaFolderPath: mediaLibraryPath,
            uniqueSuffix: component.queueItemId,
            language,
          },
        );
        uploadCache.set(absoluteUrl, uploaded);
        uploadedCount += 1;
      }

      fields[meta.name] = formatSitecoreImageFieldValue(uploaded.itemId);
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Image upload failed for field "${meta.name}": ${error.message}`
          : `Image upload failed for field "${meta.name}".`,
      );
    }
  }

  return { fields, uploadedCount, warnings };
}
