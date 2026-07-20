"use client";

import { useEffect, useState } from "react";
import { SESSION_CHANGED_EVENT } from "@/lib/sitecore/constants";
import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";
import {
  isDiscoveryPhaseComplete,
  returnToDiscoveryPhase,
  subscribeWorkflowProgress,
} from "@/lib/workflow/progress";

interface HeaderDiscoveryButtonProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export function HeaderDiscoveryButton({
  mobile = false,
  onNavigate,
}: HeaderDiscoveryButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function refresh() {
      const session = getStoredSession();
      const connected = Boolean(session && !isSessionExpired(session));
      setVisible(connected && isDiscoveryPhaseComplete());
    }

    refresh();
    window.addEventListener(SESSION_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    const unsubscribeProgress = subscribeWorkflowProgress(refresh);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      unsubscribeProgress();
    };
  }, []);

  if (!visible) {
    return null;
  }

  function handleClick() {
    returnToDiscoveryPhase();
    onNavigate?.();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-100 ${
        mobile ? "w-full px-4 py-2.5" : "px-4 py-2"
      }`}
    >
      Discovery
    </button>
  );
}
