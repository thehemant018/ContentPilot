"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HeaderConnectionStatus } from "@/components/landing/HeaderConnectionStatus";
import { HeaderDisconnectButton } from "@/components/landing/HeaderDisconnectButton";
import { HeaderDiscoveryButton } from "@/components/landing/HeaderDiscoveryButton";
import { SESSION_CHANGED_EVENT } from "@/lib/sitecore/constants";
import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";

function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        aria-hidden="true"
        className="h-5 w-5 text-slate-700"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 text-slate-700"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function useSitecoreConnectionState() {
  const [connected, setConnected] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  useEffect(() => {
    function refresh() {
      const session = getStoredSession();
      const isValid = Boolean(session && !isSessionExpired(session));
      setConnected(isValid);
      setNeedsReconnect(Boolean(session && isSessionExpired(session)));
    }

    refresh();
    window.addEventListener(SESSION_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return { connected, needsReconnect };
}

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { connected: isConnected, needsReconnect } = useSitecoreConnectionState();

  useEffect(() => {
    function handleHashChange() {
      setMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5 lg:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-sm font-bold tracking-tight text-white transition-transform duration-200 group-hover:scale-105">
            CP
          </span>
          <div className="leading-tight">
            <span className="font-display block text-sm font-semibold tracking-tight text-slate-900">
              ContentPilot
            </span>
            <span className="hidden text-xs text-slate-500 sm:block">
              Sitecore XM Cloud
            </span>
          </div>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          <HeaderConnectionStatus />
          <HeaderDiscoveryButton />
          <HeaderDisconnectButton />
          {!isConnected && (
            <a
              href="#auth"
              className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
            >
              {needsReconnect ? "Reconnect" : "Get started"}
            </a>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-header-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MenuIcon open={menuOpen} />
        </button>
      </div>

      {menuOpen && (
        <div
          id="mobile-header-menu"
          className="border-t border-slate-200 bg-white px-6 py-4 md:hidden"
        >
          <div className="flex flex-col gap-3">
            <HeaderConnectionStatus mobile />
            <HeaderDiscoveryButton
              mobile
              onNavigate={() => setMenuOpen(false)}
            />
            <HeaderDisconnectButton
              mobile
              onDisconnect={() => setMenuOpen(false)}
            />
            {!isConnected && (
              <a
                href="#auth"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
              >
                {needsReconnect ? "Reconnect" : "Get started"}
              </a>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
