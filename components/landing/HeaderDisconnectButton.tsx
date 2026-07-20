"use client";

import { useEffect, useState } from "react";
import { SESSION_CHANGED_EVENT } from "@/lib/sitecore/constants";
import { disconnectSitecore } from "@/lib/sitecore/disconnect";
import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";

interface HeaderDisconnectButtonProps {
  mobile?: boolean;
  onDisconnect?: () => void;
}

export function HeaderDisconnectButton({
  mobile = false,
  onDisconnect,
}: HeaderDisconnectButtonProps) {
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
    return null;
  }

  function handleDisconnect() {
    disconnectSitecore();
    onDisconnect?.();
  }

  return (
    <button
      type="button"
      onClick={handleDisconnect}
      className={`inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 ${
        mobile ? "w-full px-4 py-2.5" : "px-4 py-2"
      }`}
    >
      Disconnect
    </button>
  );
}
