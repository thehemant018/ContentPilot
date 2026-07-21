/** Groups presentation work by target page path and Sitecore language. */
export function pagePresentationKey(
  pagePath: string,
  language: string,
): string {
  return `${pagePath}::${language}`;
}

export function splitPagePresentationKey(key: string): {
  pagePath: string;
  language: string;
} {
  const separator = key.lastIndexOf("::");
  if (separator < 0) {
    return { pagePath: key, language: "en" };
  }
  return {
    pagePath: key.slice(0, separator),
    language: key.slice(separator + 2),
  };
}
