/** Shared CSS selector helpers for Visual Mapper (browser bridge + bulk apply). */

const SEMANTIC_CLASS_PATTERN =
  /^(rte|rich-?text|richtext|wysiwyg|prose|content|card|hero|accordion|tile|feature)$/i;

const RICH_TEXT_COMPONENT_PATTERN =
  /rte|rich-?text|article-?body|blog-?body|blog-?rte|page-?content/i;

const RICH_TEXT_ARIA_PATTERN = /article body|rich text|main content|page content/i;

export function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return String(value).replace(/[^\w-]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16);
    return `\\${hex} `;
  });
}

export function quoteAttributeValue(value: string): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function isSemanticClassName(className: string): boolean {
  return SEMANTIC_CLASS_PATTERN.test(className.trim());
}

export function isRichTextClassName(className: string): boolean {
  const trimmed = className.trim();
  return (
    /^(rte|rich-?text|richtext|wysiwyg|prose)$/i.test(trimmed) ||
    /rich-?text/i.test(trimmed)
  );
}

export function isRichTextContainerAttrs(input: {
  classNames?: string[];
  dataComponent?: string | null;
  ariaLabel?: string | null;
}): boolean {
  const classNames = input.classNames ?? [];
  if (classNames.some(isRichTextClassName)) {
    return true;
  }

  const dataComponent = input.dataComponent?.trim() ?? "";
  if (dataComponent && RICH_TEXT_COMPONENT_PATTERN.test(dataComponent)) {
    return true;
  }

  const ariaLabel = input.ariaLabel?.trim() ?? "";
  if (ariaLabel && RICH_TEXT_ARIA_PATTERN.test(ariaLabel)) {
    return true;
  }

  return false;
}

export function pickClassNamesForSelector(classNames: string[]): string[] {
  const cleaned = classNames
    .map((name) => name.trim())
    .filter((name) => name && !name.startsWith("contentpilot"));

  const semantic = cleaned.filter(isSemanticClassName);
  if (semantic.length > 0) {
    return semantic.slice(0, 2);
  }

  return cleaned.slice(0, 3);
}

export function buildNodeSelectorFromParts(input: {
  tagName: string;
  id?: string | null;
  classNames?: string[];
  dataComponent?: string | null;
  ariaLabel?: string | null;
  nthOfType?: number | null;
}): string {
  if (input.id?.trim()) {
    return `#${escapeCssIdentifier(input.id.trim())}`;
  }

  let selector = input.tagName.trim().toLowerCase() || "*";

  const dataComponent = input.dataComponent?.trim();
  if (dataComponent) {
    selector += `[data-component=${quoteAttributeValue(dataComponent)}]`;
    if (input.nthOfType && input.nthOfType > 1) {
      selector += `:nth-of-type(${input.nthOfType})`;
    }
    return selector;
  }

  const ariaLabel = input.ariaLabel?.trim();
  if (ariaLabel) {
    selector += `[aria-label=${quoteAttributeValue(ariaLabel)}]`;
    if (input.nthOfType && input.nthOfType > 1) {
      selector += `:nth-of-type(${input.nthOfType})`;
    }
    return selector;
  }

  const classNames = pickClassNamesForSelector(input.classNames ?? []);
  if (classNames.length > 0) {
    selector += `.${classNames.map(escapeCssIdentifier).join(".")}`;
  }

  if (input.nthOfType && input.nthOfType > 1) {
    selector += `:nth-of-type(${input.nthOfType})`;
  }

  return selector;
}

export function preferRichTextContainerOverInteractive(input: {
  hasRichTextContainer: boolean;
  interactiveTagName?: string | null;
  interactiveIsRichTextContainer?: boolean;
}): boolean {
  if (!input.hasRichTextContainer) {
    return false;
  }

  const tag = (input.interactiveTagName ?? "").toUpperCase();
  if (!tag) {
    return true;
  }

  if (/^H[1-6]$/.test(tag)) {
    return true;
  }

  if (input.interactiveIsRichTextContainer) {
    return true;
  }

  if (tag === "A" || tag === "BUTTON" || tag === "IMG" || tag === "SUMMARY") {
    return false;
  }

  return true;
}

/**
 * Builds alternate selectors when a stored mapping selector fails on another page
 * (e.g. unescaped Tailwind classes like border-stone-200/80).
 */
export function buildSelectorFallbacks(selector: string): string[] {
  const trimmed = selector.trim();
  if (!trimmed) {
    return [];
  }

  const fallbacks: string[] = [trimmed];
  const seen = new Set(fallbacks);

  const add = (candidate: string) => {
    const value = candidate.trim();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    fallbacks.push(value);
  };

  const dataComponentMatch = trimmed.match(
    /\[data-component=(["']?)([^"'\\\]]+)\1\]/i,
  );
  if (dataComponentMatch?.[2]) {
    const value = dataComponentMatch[2];
    add(`[data-component=${quoteAttributeValue(value)}]`);
    add(`section[data-component=${quoteAttributeValue(value)}]`);
    add(`div[data-component=${quoteAttributeValue(value)}]`);
  }

  const ariaMatch = trimmed.match(/\[aria-label=(["'])([\s\S]*?)\1\]/i);
  if (ariaMatch?.[2]) {
    add(`[aria-label=${quoteAttributeValue(ariaMatch[2])}]`);
  }

  if (/(^|[\s>.])div\.rte\b|\.rte\b/i.test(trimmed) || /\brte\b/i.test(trimmed)) {
    add("div.rte");
    add(".rte");
  }

  if (/blog-rte|article-body|rich-text|richtext/i.test(trimmed)) {
    add('[data-component="blog-rte"]');
    add('section[data-component="blog-rte"]');
    add('[aria-label="Article body"]');
    add("div.rte");
  }

  // Repair unescaped Tailwind class segments: .border-stone-200/80 → escaped form
  const repaired = trimmed.replace(/\.([^.\s>#:[\]()]+)/g, (full, className: string) => {
    if (!/[/:[\]]/.test(className) || className.includes("\\")) {
      return full;
    }
    return `.${escapeCssIdentifier(className)}`;
  });
  add(repaired);

  // Drop utility classes that commonly break selectors; keep tag + safer classes
  const withoutBrokenUtilities = trimmed
    .replace(/\.[^\s.>#:[\]()]*[/:[\]][^\s.>#:[\]()]*/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/>\s*>/g, ">")
    .trim();
  if (withoutBrokenUtilities && withoutBrokenUtilities !== trimmed) {
    add(withoutBrokenUtilities);
  }

  // Last-resort RTE landmarks only when the selector contains invalid CSS class chars
  if (/[/:[\]]/.test(trimmed)) {
    add("div.rte");
    add(".rte");
    add('[data-component="blog-rte"]');
    add('section[data-component="blog-rte"]');
    add('[aria-label="Article body"]');
    add('section[aria-label="Article body"]');
  }

  return fallbacks;
}
