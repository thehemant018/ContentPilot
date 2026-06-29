"use client";

import { useEffect, useState } from "react";
import { SESSION_CHANGED_EVENT } from "@/lib/sitecore/constants";
import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";

export function HeaderConnectionStatus({ mobile = false }: { mobile?: boolean }) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    function refresh() {
      const session = getStoredSession();
      setConnected(Boolean(session && !isSessionExpired(session)));
    }

    refresh();
    window.addEventListener(SESSION_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!connected) {
    const session = getStoredSession();
    const expired = session && isSessionExpired(session);

    return (
      <span
        className={`rounded-full border px-3 py-1 text-xs font-medium ${
          expired
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-zinc-200 bg-zinc-50 text-zinc-600"
        } ${mobile ? "inline-flex w-fit" : "hidden sm:inline-flex"}`}
      >
        {expired ? "Session expired" : "Not connected"}
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Sitecore connected
    </span>
  );
}
