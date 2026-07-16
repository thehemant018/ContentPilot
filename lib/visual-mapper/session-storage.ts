export const VISUAL_MAPPER_SITE_KEY = "contentpilot_visual_mapper_site_id";

export function saveVisualMapperSiteId(siteId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(VISUAL_MAPPER_SITE_KEY, siteId);
}

export function getVisualMapperSiteId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(VISUAL_MAPPER_SITE_KEY);
}

export function clearVisualMapperSiteId(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(VISUAL_MAPPER_SITE_KEY);
}
