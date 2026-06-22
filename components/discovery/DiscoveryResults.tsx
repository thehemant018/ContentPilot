import type { DiscoveryResult } from "@/types/discovery";

interface DiscoveryResultsProps {
  result: DiscoveryResult;
}

function PathValidationSummary({
  result,
}: {
  result: DiscoveryResult;
}) {
  if (!result.pathValidation?.length) {
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
            {item.name && (
              <span className="text-xs text-zinc-500">({item.name})</span>
            )}
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
    templateName: string;
  }>;
  emptyMessage: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-900">{title}</h4>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.path}
              className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
            >
              <p className="text-sm font-medium text-zinc-900">{item.name}</p>
              <p className="mt-0.5 font-mono text-xs text-zinc-500">
                {item.path}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Template: {item.templateName}
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

      {result.allPathsValid && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ItemList
              title="Renderings"
              items={result.renderings ?? []}
              emptyMessage="No rendering items found under the provided path."
            />
            <ItemList
              title="Media items"
              items={result.media ?? []}
              emptyMessage="No media items found under the provided path."
            />
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-zinc-900">
                Templates &amp; field definitions
              </h4>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                {result.templates?.length ?? 0}
              </span>
            </div>

            {!result.templates?.length ? (
              <p className="mt-3 text-sm text-zinc-500">
                No template definitions found under the provided path.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {result.templates.map((template) => (
                  <article
                    key={template.path}
                    className="rounded-lg border border-zinc-100 bg-zinc-50 p-4"
                  >
                    <p className="font-medium text-zinc-900">{template.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-zinc-500">
                      {template.path}
                    </p>

                    {template.fields.length === 0 ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        No fields found for this template.
                      </p>
                    ) : (
                      <table className="mt-3 w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-zinc-200 text-zinc-500">
                            <th className="py-1 pr-3 font-medium">Section</th>
                            <th className="py-1 pr-3 font-medium">Field</th>
                            <th className="py-1 font-medium">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {template.fields.map((field) => (
                            <tr
                              key={`${template.path}-${field.section}-${field.name}`}
                              className="border-b border-zinc-100 last:border-0"
                            >
                              <td className="py-1.5 pr-3 text-zinc-600">
                                {field.section}
                              </td>
                              <td className="py-1.5 pr-3 font-medium text-zinc-800">
                                {field.name}
                              </td>
                              <td className="py-1.5 text-zinc-600">
                                {field.type}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
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
