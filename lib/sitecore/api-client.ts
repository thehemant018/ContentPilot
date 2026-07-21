"use client";

import {
  getStoredSession,
  isSessionExpired,
} from "@/lib/storage/sitecore-session";

export async function sitecoreApiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const session = getStoredSession();

  if (!session || isSessionExpired(session)) {
    throw new Error("Connect to Sitecore XM Cloud before continuing.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  headers.set("X-Sitecore-Instance-Url", session.instanceUrl);
  if (session.itemOwner?.trim()) {
    headers.set("X-Sitecore-Item-Owner", session.itemOwner.trim());
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, {
    ...options,
    headers,
  });
}
