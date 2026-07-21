"use client";

import {
  buildComponentExport,
  buildDatasourcePath,
} from "@/lib/migration/queue/build-export";
import { getDiscoveryResult } from "@/lib/storage/workflow-data";
import { isHttpImageFieldValue } from "@/lib/sitecore/media-upload";
import { isSitecoreMediaPathValue } from "@/lib/sitecore/media-lookup";
import { LinkFieldValueEditor } from "@/components/review/LinkFieldValueEditor";
import { isLinkField } from "@/lib/migration/fields/link-field";
import {
  reviewFieldInputClass,
  reviewFieldLabelClass,
  reviewInputMonoClass,
  reviewLabelClass,
  reviewTextareaClass,
} from "@/components/review/form-styles";
import type { EditableFieldValue, MigrationQueueItem } from "@/types/migration-queue";

function ConfidenceBadge({
  confidence,
  score,
}: {
  confidence: MigrationQueueItem["confidence"];
  score: number;
}) {
  const styles = {
    high: "bg-emerald-100 text-emerald-800",
    medium: "bg-amber-100 text-amber-800",
    low: "bg-rose-100 text-rose-800",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${styles[confidence]}`}
    >
      {confidence} Â· {score}%
    </span>
  );
}

interface QueueItemCardProps {
  item: MigrationQueueItem;
  pageItems?: MigrationQueueItem[];
  /** Source page URL for the language currently being edited (for CTA/link parsing). */
  contentSourceUrl?: string;
  editingLanguage?: string;
  onUpdate: (
    id: string,
    updates: Partial<
      Pick<
        MigrationQueueItem,
        "fields" | "fieldsByLanguage" | "datasourcePath" | "childPlaceholderKey"
      >
    >,
  ) => void;
  onRemove: (id: string) => void;
}

export function QueueItemCard({
  item,
  pageItems = [],
  contentSourceUrl,
  editingLanguage,
  onUpdate,
  onRemove,
}: QueueItemCardProps) {
  const linkSourceUrl = contentSourceUrl?.trim() || item.sourcePageUrl;
  const queueItemsById = new Map(
    (pageItems.length > 0 ? pageItems : [item]).map((queueItem) => [
      queueItem.id,
      queueItem,
    ]),
  );
  const previewExport = item.targetPagePath.trim()
    ? buildComponentExport(item, 0, new Date().toISOString(), {
        queueItemsById,
        renderingProfiles: getDiscoveryResult()?.renderingProfiles,
      })
    : null;
  const suggestedDatasource = item.targetPagePath.trim()
    ? buildDatasourcePath({ ...item, datasourcePath: undefined })
    : "";
  const parentItem = item.parentQueueItemId
    ? queueItemsById.get(item.parentQueueItemId)
    : undefined;
  const parentRenderingName = parentItem?.renderingName;

  function updateField(fieldId: string, value: string): void {
    onUpdate(item.id, {
      fields: item.fields.map((field) =>
        field.id === fieldId ? { ...field, value } : field,
      ),
    });
  }

  function updateFieldMeta(
    fieldId: string,
    updates: Partial<
      Pick<EditableFieldValue, "sitecoreField" | "sourceRegion" | "imageAlt">
    >,
  ): void {
    onUpdate(item.id, {
      fields: item.fields.map((field) =>
        field.id === fieldId ? { ...field, ...updates } : field,
      ),
    });
  }

  function addField(): void {
    const nextIndex = item.fields.length;
    const newField: EditableFieldValue = {
      id: `field-custom-${item.id}-${nextIndex}`,
      sourceRegion: "custom",
      sitecoreField: "",
      value: "",
    };
    onUpdate(item.id, {
      fields: [...item.fields, newField],
    });
  }

  function removeField(fieldId: string): void {
    onUpdate(item.id, {
      fields: item.fields.filter((field) => field.id !== fieldId),
    });
  }

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-zinc-900">
              {item.blockHeading || `${item.blockType} component`}
            </h4>
            <ConfidenceBadge confidence={item.confidence} score={item.matchScore} />
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-rose-800">
              Queued
            </span>
            {(item.presentationDepth ?? 0) > 0 && (
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-teal-800">
                Nested
              </span>
            )}
          </div>
          {parentRenderingName && (
            <p className="mt-1 text-xs text-teal-700">
              Child of <span className="font-medium">{parentRenderingName}</span>
              {item.childPlaceholderKey
                ? ` â†’ placeholder ${item.childPlaceholderKey}`
                : ""}
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-500">
            Source:{" "}
            <span className="break-all font-mono">{item.sourcePageUrl}</span>
          </p>
          {editingLanguage && (
            <p className="mt-1 text-xs text-teal-700">
              Editing language:{" "}
              <span className="font-semibold">{editingLanguage}</span>
              {contentSourceUrl && contentSourceUrl !== item.sourcePageUrl ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="break-all font-mono text-zinc-600">
                    {contentSourceUrl}
                  </span>
                </>
              ) : null}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          Remove
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-orange-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Rendering
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-900">
            {item.renderingName || "-"}
          </p>
          {item.renderingPath && (
            <p className="mt-0.5 break-all font-mono text-xs text-zinc-500">
              {item.renderingPath}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-teal-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
            Template
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-900">
            {item.templateName || "-"}
          </p>
          {item.templatePath && (
            <p className="mt-0.5 break-all font-mono text-xs text-zinc-500">
              {item.templatePath}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border-2 border-zinc-200 bg-zinc-50/80 p-4">
        <label
          htmlFor={`datasource-${item.id}`}
          className={reviewLabelClass}
        >
          Datasource item path
        </label>
        <input
          id={`datasource-${item.id}`}
          type="text"
          value={item.datasourcePath ?? ""}
          onChange={(event) =>
            onUpdate(item.id, { datasourcePath: event.target.value })
          }
          placeholder={suggestedDatasource || "/sitecore/content/.../Data/..."}
          className={reviewInputMonoClass}
        />
        <p className="mt-1.5 text-xs text-zinc-600">
          Created under the page&apos;s SXA <span className="font-mono font-medium text-zinc-800">Data</span>{" "}
          item (local datasources), not a folder.
        </p>
        {suggestedDatasource && !item.datasourcePath?.trim() && (
          <p className="mt-1 text-xs text-zinc-600">
            Auto: <span className="font-mono font-medium text-zinc-800">{suggestedDatasource}</span>
          </p>
        )}
      </div>

      {previewExport && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
          <p className="font-semibold uppercase tracking-wide text-emerald-800">
            Push plan (uses matched Sitecore template + rendering)
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              Template:{" "}
              <span className="font-mono">
                {previewExport.datasource.templateName}
                {previewExport.datasource.templatePath
                  ? ` (${previewExport.datasource.templatePath})`
                  : ""}
              </span>
            </li>
            <li>
              Rendering:{" "}
              <span className="font-mono">
                {previewExport.presentation.renderingName}
                {previewExport.presentation.renderingPath
                  ? ` (${previewExport.presentation.renderingPath})`
                  : ""}
              </span>
            </li>
            <li>
              Page:{" "}
              <span className="font-mono">{previewExport.presentation.itemPath}</span>
            </li>
            <li>
              Placeholder:{" "}
              <span className="font-mono">
                {previewExport.presentation.placeHolder}
              </span>
              {previewExport.presentation.childPlaceholderKey &&
                previewExport.presentation.childPlaceholderKey !==
                  previewExport.presentation.placeHolder && (
                  <>
                    {" "}
                    <span className="text-emerald-800">
                      (child key:{" "}
                      <span className="font-mono">
                        {previewExport.presentation.childPlaceholderKey}
                      </span>
                      )
                    </span>
                  </>
                )}
            </li>
            <li>
              New content item under Data:{" "}
              <span className="font-mono">{previewExport.presentation.dataSource}</span>
            </li>
          </ul>
          <p className="mt-2 text-emerald-800">
            Push creates a content item from the matched template, fills your
            field values, then assigns the rendering on the page with that
            datasource.
          </p>
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
            Datasource field content
          </h5>
          <button
            type="button"
            onClick={addField}
            className="text-xs font-semibold text-rose-700 hover:text-rose-800"
          >
            + Add field
          </button>
        </div>

        {item.fields.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            No fields yet. Add a field to enter content for the datasource item.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {item.fields.map((field) => (
              <div
                key={field.id}
                className="rounded-lg border-2 border-zinc-200 bg-white p-3 shadow-sm"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className={reviewFieldLabelClass}>
                      Sitecore field
                    </label>
                    <input
                      type="text"
                      value={field.sitecoreField}
                      onChange={(event) =>
                        updateFieldMeta(field.id, {
                          sitecoreField: event.target.value,
                        })
                      }
                      placeholder="Title"
                      className={reviewFieldInputClass}
                    />
                  </div>
                  <div>
                    <label className={reviewFieldLabelClass}>
                      Source region
                    </label>
                    <input
                      type="text"
                      value={field.sourceRegion}
                      onChange={(event) =>
                        updateFieldMeta(field.id, {
                          sourceRegion: event.target.value,
                        })
                      }
                      className={reviewFieldInputClass}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className={reviewFieldLabelClass}>
                    Content value
                  </label>
                  {isLinkField(field.sitecoreField, field.fieldType) ? (
                    <LinkFieldValueEditor
                      fieldName={field.sitecoreField}
                      fieldType={field.fieldType}
                      value={field.value}
                      sourcePageUrl={linkSourceUrl}
                      onChange={(nextValue) => updateField(field.id, nextValue)}
                    />
                  ) : (
                    <>
                      <textarea
                        value={field.value}
                        onChange={(event) =>
                          updateField(field.id, event.target.value)
                        }
                        rows={3}
                        className={reviewTextareaClass}
                        placeholder={
                          field.fieldType?.toLowerCase().includes("image") ||
                          /\b(image|photo|media)\b/i.test(field.sitecoreField)
                            ? "https://... or /sitecore/media/Project/YourFolder/image-name"
                            : undefined
                        }
                      />
                      {(field.fieldType?.toLowerCase().includes("image") ||
                        /\b(image|photo|media)\b/i.test(field.sitecoreField)) && (
                        <p className="mt-1.5 text-xs text-zinc-600">
                          Paste a crawled image URL to upload, or an existing
                          Sitecore media item path to reuse without uploading.
                        </p>
                      )}
                    </>
                  )}
                </div>
                {isHttpImageFieldValue(field.value) &&
                  !isSitecoreMediaPathValue(field.value) && (
                  <div className="mt-3">
                    <label className={reviewFieldLabelClass}>
                      Image alt text (used on media upload)
                    </label>
                    <input
                      type="text"
                      value={field.imageAlt ?? ""}
                      onChange={(event) =>
                        updateFieldMeta(field.id, {
                          imageAlt: event.target.value,
                        })
                      }
                      placeholder="From crawled img alt or file name"
                      className={reviewFieldInputClass}
                    />
                  </div>
                )}
                {(field.fieldType || field.section) && (
                  <p className="mt-2 text-xs text-zinc-500">
                    {field.fieldType && `Type: ${field.fieldType}`}
                    {field.fieldType && field.section && " Â· "}
                    {field.section && `Section: ${field.section}`}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => removeField(field.id)}
                  className="mt-2 text-xs font-medium text-zinc-500 hover:text-rose-700"
                >
                  Remove field
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
