"use client";

import {
  buildComponentExport,
  buildDatasourcePath,
} from "@/lib/migration/build-export";
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
      {confidence} · {score}%
    </span>
  );
}

interface QueueItemCardProps {
  item: MigrationQueueItem;
  onUpdate: (
    id: string,
    updates: Partial<
      Pick<
        MigrationQueueItem,
        | "targetPagePath"
        | "fields"
        | "placeholder"
        | "datasourcePath"
        | "language"
      >
    >,
  ) => void;
  onRemove: (id: string) => void;
}

export function QueueItemCard({ item, onUpdate, onRemove }: QueueItemCardProps) {
  const previewExport = item.targetPagePath.trim()
    ? buildComponentExport(item, 0, new Date().toISOString())
    : null;
  const suggestedDatasource = item.targetPagePath.trim()
    ? buildDatasourcePath({ ...item, datasourcePath: undefined })
    : "";

  function updateField(fieldId: string, value: string): void {
    onUpdate(item.id, {
      fields: item.fields.map((field) =>
        field.id === fieldId ? { ...field, value } : field,
      ),
    });
  }

  function updateFieldMeta(
    fieldId: string,
    updates: Partial<Pick<EditableFieldValue, "sitecoreField" | "sourceRegion">>,
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
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Source:{" "}
            <span className="break-all font-mono">{item.sourcePageUrl}</span>
          </p>
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
            {item.renderingName || "—"}
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
            {item.templateName || "—"}
          </p>
          {item.templatePath && (
            <p className="mt-0.5 break-all font-mono text-xs text-zinc-500">
              {item.templatePath}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label
            htmlFor={`target-${item.id}`}
            className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
          >
            Target Sitecore page path
          </label>
          <input
            id={`target-${item.id}`}
            type="text"
            value={item.targetPagePath}
            onChange={(event) =>
              onUpdate(item.id, { targetPagePath: event.target.value })
            }
            placeholder="/sitecore/content/YourSite/Home"
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-rose-500 focus:border-rose-500 focus:ring-2"
          />
        </div>
        <div>
          <label
            htmlFor={`placeholder-${item.id}`}
            className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
          >
            Presentation placeholder
          </label>
          <input
            id={`placeholder-${item.id}`}
            type="text"
            value={item.placeholder ?? "main"}
            onChange={(event) =>
              onUpdate(item.id, { placeholder: event.target.value })
            }
            placeholder="main"
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-rose-500 focus:border-rose-500 focus:ring-2"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label
            htmlFor={`datasource-${item.id}`}
            className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
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
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs outline-none ring-rose-500 focus:border-rose-500 focus:ring-2"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Created under the page&apos;s SXA <span className="font-mono">Data</span>{" "}
            item (local datasources), not a folder.
          </p>
          {suggestedDatasource && !item.datasourcePath?.trim() && (
            <p className="mt-1 text-xs text-zinc-500">
              Auto: <span className="font-mono">{suggestedDatasource}</span>
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor={`language-${item.id}`}
            className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
          >
            Language
          </label>
          <input
            id={`language-${item.id}`}
            type="text"
            value={item.language ?? "en"}
            onChange={(event) =>
              onUpdate(item.id, { language: event.target.value })
            }
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-rose-500 focus:border-rose-500 focus:ring-2"
          />
        </div>
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
              Placeholder: {previewExport.presentation.placeHolder}
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
          <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
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
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600">
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
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600">
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
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-zinc-600">
                    Content value
                  </label>
                  <textarea
                    value={field.value}
                    onChange={(event) => updateField(field.id, event.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
                {(field.fieldType || field.section) && (
                  <p className="mt-2 text-xs text-zinc-500">
                    {field.fieldType && `Type: ${field.fieldType}`}
                    {field.fieldType && field.section && " · "}
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
