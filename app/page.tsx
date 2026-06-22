import { ConnectSitecoreForm } from "@/components/landing/ConnectSitecoreForm";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { WorkflowPhases } from "@/components/landing/WorkflowPhases";

export default function Home() {
  return (
    <div className="min-h-full bg-gradient-to-b from-violet-50 via-white to-zinc-50">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-10 lg:px-8 lg:py-14">
        <Hero />
        <ConnectSitecoreForm />
        <WorkflowPhases />
      </main>
      <footer className="border-t border-zinc-200 bg-white px-6 py-6 text-center text-xs text-zinc-500">
        MigrateX performs read-only Sitecore operations until you explicitly
        approve migration changes.
      </footer>
    </div>
  );
}
