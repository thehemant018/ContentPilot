import {
  buildMediaCandidateStems,
  resolveMediaDisplayName,
  resolveMediaItemStem,
} from "@/lib/migration/image-metadata";
import {
  findExistingMediaItem,
  isSitecoreImageFieldValue,
  resolveExistingMediaFromFieldValue,
} from "@/lib/sitecore/media-lookup";
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
  reusedCount: number;
  warnings: string[];
}

export async function resolveMediaFieldsForComponent(
  instanceUrl: string,
  accessToken: string,
  component: MigrationComponentExport,
  mediaLibraryPath: string,
  uploadCache: Map<string, UploadMediaResult>,
  folderSearchCache?: Map<
    string,
    Array<{ itemId: string; name: string; path: string }>
  >,
): Promise<ResolveMediaFieldsResult> {
  const fields = { ...component.datasource.fields };
  const warnings: string[] = [];
  let uploadedCount = 0;
  let reusedCount = 0;
  const language = component.presentation.language || "en";

  for (const meta of component.datasource.fieldMeta) {
    const value = fields[meta.name];
    if (!value) {
      continue;
    }

    if (!isImageField(meta.name, meta.type)) {
      continue;
    }

    if (isSitecoreImageFieldValue(value)) {
      continue;
    }

    const existingFromValue = await resolveExistingMediaFromFieldValue(
      instanceUrl,
      accessToken,
      value,
    );
    if (existingFromValue) {
      fields[meta.name] = formatSitecoreImageFieldValue(existingFromValue.itemId);
      reusedCount += 1;
      continue;
    }

    if (!isHttpImageFieldValue(value)) {
      continue;
    }

    const absoluteUrl = resolveAbsoluteImageUrl(
      value,
      component.sourcePageUrl,
    );

    try {
      let resolved = uploadCache.get(absoluteUrl);
      if (!resolved) {
        const imageAlt = meta.imageAlt?.trim();
        const candidateStems = buildMediaCandidateStems(imageAlt, absoluteUrl);
        const existing = await findExistingMediaItem(
          instanceUrl,
          accessToken,
          mediaLibraryPath,
          candidateStems,
          folderSearchCache,
        );

        if (existing) {
          resolved = { ...existing, sourceUrl: absoluteUrl };
          reusedCount += 1;
        } else {
          const alt = resolveMediaDisplayName(imageAlt, absoluteUrl);
          resolved = await uploadImageFromUrl(
            instanceUrl,
            accessToken,
            absoluteUrl,
            {
              mediaFolderPath: mediaLibraryPath,
              uniqueSuffix: component.queueItemId,
              language,
              alt,
              displayName: resolveMediaItemStem(imageAlt, absoluteUrl),
            },
          );
          uploadedCount += 1;
        }

        uploadCache.set(absoluteUrl, resolved);
      } else {
        reusedCount += 1;
      }

      fields[meta.name] = formatSitecoreImageFieldValue(resolved.itemId);
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Image upload failed for field "${meta.name}": ${error.message}`
          : `Image upload failed for field "${meta.name}".`,
      );
    }
  }

  return { fields, uploadedCount, reusedCount, warnings };
}
