"use client";

import { SESSION_CHANGED_EVENT, STORAGE_KEYS } from "@/lib/sitecore/constants";
import type { StoredSitecoreSession } from "@/types/sitecore";

export function getStoredSession(): StoredSitecoreSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(STORAGE_KEYS.session);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as StoredSitecoreSession;
    if (!session.accessToken || !session.instanceUrl) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(
  accessToken: string,
  expiresIn: number,
  instanceUrl: string,
): StoredSitecoreSession {
  const session: StoredSitecoreSession = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    instanceUrl,
    connectedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  return session;
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEYS.session);
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function isSessionExpired(session: StoredSitecoreSession): boolean {
  return Date.now() >= session.expiresAt;
}

export function formatExpiry(session: StoredSitecoreSession): string {
  return new Date(session.expiresAt).toLocaleString();
}
