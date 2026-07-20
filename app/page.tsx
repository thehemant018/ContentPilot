import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { WorkflowTabs } from "@/components/workflow/WorkflowTabs";
import { Analytics } from "@vercel/analytics/next";

export default function Home() {
  return (
    <div className="app-shell relative min-h-full bg-[#f4f7f8] text-slate-900">
      <div
        aria-hidden="true"
        className="app-grid pointer-events-none absolute inset-x-0 top-0 h-[42rem]"
      />
      <Header />
      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 lg:gap-12 lg:px-8 lg:py-14">
        <Hero />
        <WorkflowTabs />
      </main>
      <footer className="relative border-t border-slate-200 bg-white px-6 py-6 text-center text-xs text-slate-500">
        ContentPilot performs read-only Sitecore operations until you explicitly
        approve migration changes.
      </footer>
      <Analytics />
    </div>
  );
}
