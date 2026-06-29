"use client";

import type { MappingEntry } from "@/types/visual-mapper";

interface MappingsTableProps {
  mappings: MappingEntry[];
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onRowClick: (selector: string) => void;
}

export function MappingsTable({
  mappings,
  onEdit,
  onRemove,
  onRowClick,
}: MappingsTableProps) {
  if (mappings.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No components queued yet. Complete component + field mapping, then click{" "}
        <span className="font-semibold">Add to queue</span>.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-2 py-2 font-semibold">#</th>
            <th className="px-2 py-2 font-semibold">Component</th>
            <th className="px-2 py-2 font-semibold">Rendering</th>
            <th className="px-2 py-2 font-semibold">Fields mapped</th>
            <th className="px-2 py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((entry, index) => (
              <tr
                key={entry.id}
                className="cursor-pointer border-b border-zinc-100 align-top hover:bg-zinc-50"
                onClick={() => onRowClick(entry.sourceSelector)}
              >
                <td className="px-2 py-2 text-zinc-500">{index + 1}</td>
                <td className="px-2 py-2 font-mono text-xs text-zinc-700">
                  {entry.sourceSelector}
                </td>
                <td className="px-2 py-2 font-medium text-zinc-800">
                  {entry.renderingName}
                </td>
                <td className="px-2 py-2 text-zinc-600">
                  {entry.fieldAssignments.filter((f) => f.value.trim()).length}/
                  {entry.fieldAssignments.length} fields
                </td>
                <td className="px-2 py-2">
                  <div
                    className="flex gap-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onEdit(entry.id)}
                      className="rounded border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(entry.id)}
                      className="rounded border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
