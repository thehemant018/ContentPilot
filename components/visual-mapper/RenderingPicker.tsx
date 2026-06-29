"use client";

import { useMemo, useState } from "react";
import { visualMapperInputClass } from "@/components/visual-mapper/form-styles";
import type { DiscoveryItem } from "@/types/discovery";

interface RenderingPickerProps {
  renderings: DiscoveryItem[];
  value: string | null;
  onChange: (renderingName: string) => void;
}

export function RenderingPicker({
  renderings,
  value,
  onChange,
}: RenderingPickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return renderings;
    }
    return renderings.filter(
      (item) =>
        item.name.toLowerCase().includes(normalized) ||
        item.path.toLowerCase().includes(normalized),
    );
  }, [query, renderings]);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Sitecore rendering
      </label>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search renderings…"
        className={visualMapperInputClass}
      />

      <div
        className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50/80 shadow-sm"
        role="listbox"
        aria-label="Sitecore renderings"
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-zinc-500">
            No renderings match your search.
          </p>
        ) : (
          <ul className="max-h-48 overflow-y-auto overscroll-contain p-1">
            {filtered.map((rendering) => {
              const isSelected = value === rendering.name;

              return (
                <li key={rendering.itemId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => onChange(rendering.name)}
                    className={`group flex w-full flex-col rounded-md px-3 py-2.5 text-left transition-all duration-150 ease-out ${
                      isSelected
                        ? "bg-blue-100 text-blue-900 shadow-sm ring-1 ring-blue-200"
                        : "text-zinc-600 hover:bg-white hover:text-zinc-900 hover:shadow-sm hover:ring-1 hover:ring-zinc-200"
                    }`}
                  >
                    <span
                      className={`text-sm transition-colors duration-150 ${
                        isSelected
                          ? "font-semibold text-blue-900"
                          : "font-medium group-hover:text-zinc-900"
                      }`}
                    >
                      {rendering.name}
                    </span>
                    <span
                      className={`mt-0.5 truncate font-mono text-[11px] transition-colors duration-150 ${
                        isSelected
                          ? "text-blue-700/80"
                          : "text-zinc-400 group-hover:text-zinc-500"
                      }`}
                    >
                      {rendering.path}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!value && filtered.length > 0 && (
        <p className="text-xs text-zinc-500">Select a rendering from the list.</p>
      )}
    </div>
  );
}
