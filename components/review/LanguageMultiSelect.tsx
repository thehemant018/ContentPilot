"use client";

import { formatSitecoreLanguageLabel } from "@/lib/migration/language/language-mapping";
import type { LanguagePickerOption } from "@/lib/migration/language/language-mapping";

interface LanguageMultiSelectProps {
  id: string;
  options: LanguagePickerOption[];
  selected: string[];
  onChange: (languages: string[]) => void;
}

export function LanguageMultiSelect({
  id,
  options,
  selected,
  onChange,
}: LanguageMultiSelectProps) {
  function toggleLanguage(languageName: string, checked: boolean) {
    if (checked) {
      onChange([...new Set([...selected, languageName])]);
      return;
    }
    onChange(selected.filter((entry) => entry !== languageName));
  }

  if (options.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        Run Discovery to load Sitecore languages.
      </p>
    );
  }

  return (
    <ul
      id={id}
      className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3"
      aria-label="Sitecore language versions"
    >
      {options.map((option) => {
        const inputId = `${id}-${option.language.name}`;
        const isChecked = selected.includes(option.language.name);

        return (
          <li key={option.language.name}>
            <label
              htmlFor={inputId}
              className={`flex items-start gap-2 text-sm ${
                option.selectable
                  ? "cursor-pointer text-zinc-800"
                  : "cursor-not-allowed text-zinc-400"
              }`}
            >
              <input
                id={inputId}
                type="checkbox"
                className="mt-0.5"
                checked={isChecked}
                disabled={!option.selectable}
                onChange={(event) =>
                  toggleLanguage(option.language.name, event.target.checked)
                }
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {formatSitecoreLanguageLabel(option.language)}
                </span>
                {option.hint ? (
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {option.hint}
                  </span>
                ) : (
                  <span className="mt-0.5 block text-xs text-emerald-700">
                    {option.language.name === "en"
                      ? "Default language — included on every migration when on target site"
                      : "Matched on source site and target Sitecore site"}
                  </span>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
