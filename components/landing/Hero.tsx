export function Hero() {
  return (
    <section className="w-full text-center lg:text-left">
      <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
        <span className="h-2 w-2 rounded-full bg-violet-500" />
        MigrateX — Sitecore content migration
      </div>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
        Migrate source content into{" "}
        <span className="text-violet-600">Sitecore XM Cloud</span>
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-600">
        A guided workflow to discover your Sitecore structure, crawl a source
        site, match components with AI, review mappings, and migrate content —
        starting with a secure connection to your XM Cloud environment.
      </p>
    </section>
  );
}
