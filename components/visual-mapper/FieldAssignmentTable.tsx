"use client";

import type { FieldAssignment } from "@/types/visual-mapper";

interface FieldAssignmentTableProps {
  fields: FieldAssignment[];
  activeFieldId: string | null;
  onPickFromPage: (fieldId: string) => void;
  onClearField: (fieldId: string) => void;
}

function ValuePreview({ field }: { field: FieldAssignment }) {
  if (!field.value) {
    return <span className="text-zinc-400 italic">empty</span>;
  }

  if (/image/i.test(field.fieldType) && field.value.startsWith("http")) {
    return (
      <img
        src={field.value}
        alt={field.sitecoreField}
        className="h-10 max-w-[120px] rounded border border-zinc-200 object-cover"
      />
    );
  }

  if (/link/i.test(field.fieldType)) {
    return (
      <span className="break-all font-mono text-xs text-blue-700">
        {field.valuePreview || field.value}
      </span>
    );
  }

  return (
    <span className="line-clamp-2 text-sm text-zinc-700">
      {field.valuePreview || field.value}
    </span>
  );
}

export function FieldAssignmentTable({
  fields,
  activeFieldId,
  onPickFromPage,
  onClearField,
}: FieldAssignmentTableProps) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Select a rendering to see datasource template fields.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-2 py-2 font-semibold">Field name</th>
            <th className="px-2 py-2 font-semibold">Type</th>
            <th className="px-2 py-2 font-semibold">Value</th>
            <th className="px-2 py-2 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr
              key={field.sitecoreField}
              className={`border-b border-zinc-100 align-top ${
                activeFieldId === field.sitecoreField ? "bg-blue-50" : ""
              }`}
            >
              <td className="px-2 py-2 font-medium text-zinc-800">
                {field.sitecoreField}
              </td>
              <td className="px-2 py-2 text-xs text-zinc-500">
                {field.fieldType}
              </td>
              <td className="max-w-[180px] px-2 py-2">
                <ValuePreview field={field} />
              </td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => onPickFromPage(field.sitecoreField)}
                    className={`rounded border px-2 py-1 text-xs font-semibold transition-colors ${
                      activeFieldId === field.sitecoreField
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                    }`}
                  >
                    Pick from page
                  </button>
                  {field.value && (
                    <button
                      type="button"
                      onClick={() => onClearField(field.sitecoreField)}
                      className="rounded border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
