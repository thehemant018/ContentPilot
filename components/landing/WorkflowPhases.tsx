const phases = [
  {
    id: 1,
    name: "Auth",
    description: "Connect to Sitecore XM Cloud with OAuth credentials.",
    color: "bg-violet-600",
    ring: "ring-violet-200",
    active: true,
  },
  {
    id: 2,
    name: "Discovery",
    description: "List sites, renderings, and template field maps.",
    color: "bg-teal-600",
    ring: "ring-teal-200",
    active: false,
  },
  {
    id: 3,
    name: "Crawl",
    description: "Parse source pages and detect semantic content blocks.",
    color: "bg-blue-600",
    ring: "ring-blue-200",
    active: false,
  },
  {
    id: 4,
    name: "AI Match",
    description: "Match blocks to Sitecore renderings with field previews.",
    color: "bg-orange-500",
    ring: "ring-orange-200",
    active: false,
  },
  {
    id: 5,
    name: "Review",
    description: "Confirm, override, or skip suggested mappings.",
    color: "bg-rose-500",
    ring: "ring-rose-200",
    active: false,
  },
  {
    id: 6,
    name: "Migrate",
    description: "Create items, upload media, and populate fields.",
    color: "bg-emerald-600",
    ring: "ring-emerald-200",
    active: false,
  },
] as const;

export function WorkflowPhases() {
  return (
    <section id="workflow" className="w-full scroll-mt-24">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Migration workflow
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {phases.map((phase) => (
          <article
            key={phase.id}
            className={`rounded-xl border p-4 transition-shadow ${
              phase.active
                ? `border-violet-300 bg-violet-50 shadow-sm ring-2 ${phase.ring}`
                : "border-zinc-200 bg-white opacity-70"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white ${phase.color}`}
              >
                {phase.id}
              </span>
              <div>
                <h3 className="font-semibold text-zinc-900">{phase.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                  {phase.description}
                </p>
              </div>
            </div>
            {phase.active && (
              <p className="mt-3 text-xs font-medium text-violet-700">
                Current phase
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
