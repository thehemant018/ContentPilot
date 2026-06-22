import type { SitecoreSite } from "@/types/discovery";

interface SiteSelectorProps {
  sites: SitecoreSite[];
  selectedSite: SitecoreSite | null;
  isLoading: boolean;
  onSelect: (site: SitecoreSite) => void;
}

export function SiteSelector({
  sites,
  selectedSite,
  isLoading,
  onSelect,
}: SiteSelectorProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900">Available sites</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Choose the Sitecore site that will receive migrated content.
      </p>

      {isLoading && (
        <p className="mt-4 text-sm text-zinc-500">Loading sites from instance…</p>
      )}

      {!isLoading && sites.length === 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No sites were returned from this instance. Check your credentials and
          try refreshing.
        </p>
      )}

      {!isLoading && sites.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {sites.map((site) => {
            const isSelected = selectedSite?.name === site.name;

            return (
              <button
                key={site.name}
                type="button"
                onClick={() => onSelect(site)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? "border-teal-400 bg-teal-50 ring-2 ring-teal-200"
                    : "border-zinc-200 bg-white hover:border-teal-200 hover:bg-teal-50/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-900">{site.name}</span>
                  {isSelected && (
                    <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Selected
                    </span>
                  )}
                </div>
                <dl className="mt-3 space-y-1 text-xs text-zinc-600">
                  <div className="flex gap-2">
                    <dt className="font-medium text-zinc-500">Root:</dt>
                    <dd className="font-mono">{site.rootPath}</dd>
                  </div>
                  {site.startPath && (
                    <div className="flex gap-2">
                      <dt className="font-medium text-zinc-500">Start:</dt>
                      <dd className="font-mono">{site.startPath}</dd>
                    </div>
                  )}
                  {site.domain && (
                    <div className="flex gap-2">
                      <dt className="font-medium text-zinc-500">Domain:</dt>
                      <dd>{site.domain}</dd>
                    </div>
                  )}
                </dl>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
