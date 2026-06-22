import Link from "next/link";
import { HeaderConnectionStatus } from "@/components/landing/HeaderConnectionStatus";

const navLinks = [
  { href: "#connect", label: "Connect" },
  { href: "#workflow", label: "Workflow" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-violet-100/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold text-white shadow-sm transition-transform group-hover:scale-105">
            MX
          </span>
          <div className="leading-tight">
            <span className="block text-sm font-bold tracking-tight text-zinc-900">
              MigrateX
            </span>
            <span className="hidden text-xs text-zinc-500 sm:block">
              Sitecore XM Cloud
            </span>
          </div>
        </Link>

        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-1 md:flex"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <HeaderConnectionStatus />
          <a
            href="#connect"
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700"
          >
            Get started
          </a>
        </div>
      </div>
    </header>
  );
}
