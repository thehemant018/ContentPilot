/** Extract a locale segment from the start of a URL path (e.g. /en/, /fr-CA/). */
export function extractLocaleFromUrl(pageUrl: string): string | undefined {
  try {
    const url = new URL(pageUrl);
    const match = url.pathname.match(
      /^\/([a-z]{2}(?:-[a-zA-Z]{2})?)(?:\/|$)/i,
    );
    return match?.[1];
  } catch {
    return undefined;
  }
}
