"use client";

import {
  formatInternalLinkDisplayPath,
  formatLinkPreview,
  isLinkField,
  parseLinkFieldValue,
  rebuildLinkField,
  type LinkKind,
} from "@/lib/migration/fields/link-field";
import {
  reviewFieldInputClass,
  reviewFieldLabelClass,
} from "@/components/review/form-styles";

interface LinkFieldValueEditorProps {
  fieldName: string;
  fieldType?: string;
  value: string;
  sourcePageUrl: string;
  onChange: (value: string) => void;
}

export function LinkFieldValueEditor({
  fieldName,
  fieldType,
  value,
  sourcePageUrl,
  onChange,
}: LinkFieldValueEditorProps) {
  if (!isLinkField(fieldName, fieldType)) {
    return null;
  }

  const parsed = parseLinkFieldValue(value, sourcePageUrl);

  if (!parsed) {
    return (
      <p className="text-xs text-amber-700">
        Link value could not be parsed. Use a full URL or path like /contact-us.
      </p>
    );
  }

  function applyLinkType(linkType: LinkKind) {
    const rebuilt = rebuildLinkField(value, sourcePageUrl, { linkType });
    onChange(rebuilt.value);
  }

  function applyUrl(url: string) {
    const rebuilt = rebuildLinkField(value, sourcePageUrl, { url });
    onChange(rebuilt.value);
  }

  function applyText(text: string) {
    const rebuilt = rebuildLinkField(value, sourcePageUrl, { text });
    onChange(rebuilt.value);
  }

  function applyTarget(target: string) {
    const rebuilt = rebuildLinkField(value, sourcePageUrl, { target });
    onChange(rebuilt.value);
  }

  const displayUrl =
    parsed.linkType === "internal"
      ? formatInternalLinkDisplayPath(parsed.path || parsed.url, sourcePageUrl)
      : parsed.url;

  return (
    <div className="space-y-3 rounded-lg border border-teal-100 bg-teal-50/40 p-3">
      <div className="flex flex-wrap gap-1">
        {(["internal", "external"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => applyLinkType(kind)}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              parsed.linkType === kind
                ? kind === "internal"
                  ? "bg-teal-200 text-teal-900"
                  : "bg-sky-200 text-sky-900"
                : "bg-white text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            {kind}
          </button>
        ))}
      </div>

      <p className="text-xs font-medium text-teal-900">
        {formatLinkPreview(parsed, sourcePageUrl)}
      </p>

      <div>
        <label className={reviewFieldLabelClass}>Link URL or path</label>
        <input
          type="text"
          value={displayUrl}
          onChange={(event) => applyUrl(event.target.value)}
          className={reviewFieldInputClass}
          placeholder="https://example.com/page or /contact-us"
        />
      </div>

      <div>
        <label className={reviewFieldLabelClass}>Link text</label>
        <input
          type="text"
          value={parsed.text}
          onChange={(event) => applyText(event.target.value)}
          className={reviewFieldInputClass}
          placeholder="Button or CTA label"
        />
      </div>

      <div>
        <label className={reviewFieldLabelClass}>Target</label>
        <input
          type="text"
          value={parsed.target}
          onChange={(event) => applyTarget(event.target.value)}
          className={reviewFieldInputClass}
          placeholder="_blank (optional)"
        />
      </div>

      <p className="text-xs text-zinc-600">
        Internal links resolve to Sitecore items on push using your target page
        path. External links keep the full URL.
      </p>
    </div>
  );
}
