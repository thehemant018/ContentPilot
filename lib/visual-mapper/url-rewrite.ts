/**
 * Rewrites relative URLs in HTML to absolute using regex + base URL replacement.
 */
export function rewriteRelativeUrls(html: string, baseUrl: URL): string {
  const origin = baseUrl.origin;
  const basePath = baseUrl.pathname.endsWith("/")
    ? baseUrl.pathname
    : baseUrl.pathname.replace(/\/[^/]*$/, "/");

  function toAbsolute(path: string): string {
    if (/^(https?:|data:|mailto:|tel:|#|javascript:)/i.test(path)) {
      return path;
    }
    if (path.startsWith("//")) {
      return `${baseUrl.protocol}${path}`;
    }
    if (path.startsWith("/")) {
      return `${origin}${path}`;
    }
    return `${origin}${basePath}${path}`;
  }

  let result = html;

  result = result.replace(
    /\b(href|src|action|poster|data-src|data-href)\s*=\s*(["'])([^"']+)\2/gi,
    (_match, attr: string, quote: string, url: string) =>
      `${attr}=${quote}${toAbsolute(url)}${quote}`,
  );

  result = result.replace(
    /url\s*\(\s*(["']?)([^"')]+)\1\s*\)/gi,
    (_match, quote: string, url: string) =>
      `url(${quote}${toAbsolute(url.trim())}${quote})`,
  );

  result = result.replace(
    /<base\b[^>]*>/gi,
    "",
  );

  return result;
}

export function injectBridgeScript(html: string, script: string): string {
  const tag = `<script>${script}</script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${tag}</body>`);
  }
  return `${html}${tag}`;
}
