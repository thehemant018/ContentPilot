import type { DiscoveryResult } from "@/types/discovery";

interface DiscoveryResultsProps {
  result: DiscoveryResult;
}

const SCROLL_PANEL_CLASS =
  "mt-3 max-h-80 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]";

function PathValidationSummary({
  result,
}: {
  result: DiscoveryResult;
}) {
  if (result.success || !result.pathValidation?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <h4 className="text-sm font-semibold text-zinc-900">Path validation</h4>
      <ul className="mt-3 space-y-2">
        {result.pathValidation.map((item) => (
          <li
            key={item.label}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                item.exists
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {item.exists ? "Found" : "Missing"}
            </span>
            <span className="font-medium text-zinc-700">{item.label}:</span>
            <span className="font-mono text-xs text-zinc-600">{item.path}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemList({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: Array<{
    name: string;
    path: string;
  }>;
  emptyMessage: string;
}) {
  return (
    <div className="flex max-h-96 flex-col rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-900">{title}</h4>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
        <ul className={`${SCROLL_PANEL_CLASS} space-y-2`}>
          {items.map((item) => (
            <li
              key={item.path}
              className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
            >
              <p className="text-sm font-medium text-zinc-900">{item.name}</p>
              <p className="mt-0.5 font-mono text-xs text-zinc-500">
                {item.path}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DiscoveryResults({ result }: DiscoveryResultsProps) {
  return (
    <div className="space-y-6 border-t border-zinc-200 pt-6">
      <PathValidationSummary result={result} />

      {result.success && (
        <>
          {result.mediaPath && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              <span className="font-medium text-zinc-900">Media upload folder:</span>{" "}
              <span className="font-mono text-xs">{result.mediaPath}</span>
            </div>
          )}

          <ItemList
            title="Renderings"
            items={result.renderings ?? []}
            emptyMessage="No rendering items found under the provided path."
          />

          <div className="flex max-h-[32rem] flex-col rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-zinc-900">
                Templates &amp; field definitions
              </h4>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                {result.templates?.length ?? 0}
              </span>
            </div>

            {!result.templates?.length ? (
              <p className="mt-3 text-sm text-zinc-500">
                No datasource templates found under the provided path.
              </p>
            ) : (
              <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                {result.templates.map((template) => (
                  <article
                    key={template.path}
                    className="rounded-lg border border-zinc-100 bg-zinc-50 p-4"
                  >
                    <p className="font-medium text-zinc-900">{template.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-zinc-500">
                      {template.path}
                    </p>

                    <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200 bg-white">
                      <table className="w-full min-w-[28rem] text-left text-xs">
                        <thead className="bg-zinc-50">
                          <tr className="border-b border-zinc-200 text-zinc-500">
                            <th className="py-2 pr-3 pl-3 font-medium">
                              Section
                            </th>
                            <th className="py-2 pr-3 font-medium">Field</th>
                            <th className="py-2 pr-3 font-medium">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {template.fields.map((field) => (
                            <tr
                              key={`${template.path}-${field.section}-${field.name}`}
                              className="border-b border-zinc-100 last:border-0"
                            >
                              <td className="py-1.5 pr-3 pl-3 text-zinc-600">
                                {field.section}
                              </td>
                              <td className="py-1.5 pr-3 font-medium text-zinc-800">
                                {field.name}
                              </td>
                              <td className="py-1.5 pr-3 text-zinc-600">
                                {field.type}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
