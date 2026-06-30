/** Bridge script injected into proxied pages for element selection and field picking. */
import { CONSENT_SELECTOR } from "@/lib/visual-mapper/consent-cleanup";

export function buildBridgeScript(pageSourceUrl: string): string {
  return `
(function() {
  var CONSENT_SELECTOR = ${JSON.stringify(CONSENT_SELECTOR)};
  var PAGE_SOURCE_URL = ${JSON.stringify(pageSourceUrl)};
  let activeOverlay = null;
  let pickingMode = false;
  let pickingFieldId = null;

  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'ENABLE_PICK_MODE') {
      pickingMode = true;
      pickingFieldId = e.data.fieldId;
      document.body.style.cursor = 'crosshair';
    }
    if (e.data.type === 'DISABLE_PICK_MODE') {
      pickingMode = false;
      pickingFieldId = null;
      document.body.style.cursor = '';
    }
    if (e.data.type === 'HIGHLIGHT_SELECTOR') {
      highlightSelector(e.data.selector);
    }
    if (e.data.type === 'CLEAR_HIGHLIGHTS') {
      clearAllHighlights();
    }
  });

  document.addEventListener('mouseover', (e) => {
    if (pickingMode) return;
    if (activeOverlay) activeOverlay.style.outline = '';
    e.target.style.outline = '2px solid #3B82F6';
    e.target.style.outlineOffset = '2px';
    activeOverlay = e.target;
    e.stopPropagation();
  });

  document.addEventListener('mouseout', (e) => {
    if (pickingMode) return;
    if (!e.target.dataset.migratexSelected) {
      e.target.style.outline = '';
    }
  });

  function isConsentTarget(target) {
    if (!target || !target.closest) return false;
    try {
      return target.closest(CONSENT_SELECTOR) !== null;
    } catch (err) {
      return false;
    }
  }

  document.addEventListener('click', (e) => {
    if (isConsentTarget(e.target)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    const selector = getSelector(el);
    const extracted = extractFromElement(el);

    if (pickingMode) {
      window.parent.postMessage({
        type: 'FIELD_VALUE_PICKED',
        fieldId: pickingFieldId,
        selector: selector,
        content: extracted
      }, '*');
      pickingMode = false;
      pickingFieldId = null;
      document.body.style.cursor = '';
      el.style.outline = '2px solid #22C55E';
      setTimeout(function() { el.style.outline = ''; }, 1200);
    } else {
      clearAllHighlights();
      el.dataset.migratexSelected = 'true';
      el.style.outline = '2px solid #22C55E';
      el.style.outlineOffset = '2px';
      window.parent.postMessage({
        type: 'ELEMENT_SELECTED',
        selector: selector,
        tagName: el.tagName,
        extracted: extracted,
        boundingRect: el.getBoundingClientRect().toJSON()
      }, '*');
    }
  }, true);

  function clearAllHighlights() {
    document.querySelectorAll('[data-migratex-selected]').forEach(function(el) {
      el.style.outline = '';
      delete el.dataset.migratexSelected;
    });
  }

  function highlightSelector(selector) {
    clearAllHighlights();
    try {
      const el = document.querySelector(selector);
      if (el) {
        el.dataset.migratexSelected = 'true';
        el.style.outline = '2px solid #22C55E';
        el.style.outlineOffset = '2px';
      }
    } catch(err) {}
  }

  function getSelector(el) {
    if (el.id) return '#' + el.id;
    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList)
      .filter(function(c) { return !c.startsWith('migratex'); })
      .slice(0, 3)
      .join('.');
    return classes ? tag + '.' + classes : tag;
  }

  function unwrapProxiedUrl(url) {
    var trimmed = String(url || '').trim();
    if (!trimmed) return '';
    try {
      var parsed = new URL(trimmed, PAGE_SOURCE_URL);
      if (parsed.pathname.endsWith('/api/proxy-asset') || parsed.pathname.endsWith('/api/proxy-page')) {
        var inner = parsed.searchParams.get('url');
        if (inner) return decodeURIComponent(inner);
      }
    } catch (err) {}
    return trimmed;
  }

  function resolveNavigationHref(raw) {
    var trimmed = String(raw || '').trim();
    if (!trimmed || /^(#|javascript:|mailto:|tel:)/i.test(trimmed)) return trimmed;
    var unwrapped = unwrapProxiedUrl(trimmed);
    if (/^https?:\\/\\//i.test(unwrapped)) return unwrapped;
    try {
      return new URL(unwrapped, PAGE_SOURCE_URL).href;
    } catch (err) {
      return unwrapped;
    }
  }

  function extractHref(el) {
    var anchor = el.tagName === 'A' ? el : (el.closest ? el.closest('a') : null);
    if (anchor) {
      return resolveNavigationHref(anchor.getAttribute('href') || '');
    }
    var dataHref = el.getAttribute('data-href') || el.getAttribute('data-url') || el.getAttribute('data-link');
    if (dataHref) return resolveNavigationHref(dataHref);
    if (el.href) return resolveNavigationHref(el.getAttribute('href') || el.href);
    return '';
  }

  function extractSrc(el) {
    var img = el.tagName === 'IMG' ? el : (el.querySelector ? el.querySelector('img') : null);
    var target = img || el;
    var raw = target.getAttribute('src') || target.getAttribute('data-src') || target.src || target.currentSrc || '';
    return resolveNavigationHref(unwrapProxiedUrl(raw));
  }

  function extractFromElement(el) {
    var anchor = el.tagName === 'A' ? el : (el.closest ? el.closest('a') : null);
    return {
      text: (el.innerText && el.innerText.trim().slice(0, 500)) || '',
      html: (el.innerHTML && el.innerHTML.slice(0, 1000)) || '',
      src: extractSrc(el),
      href: extractHref(el),
      alt: el.alt || '',
      tagName: el.tagName,
      isImage: el.tagName === 'IMG' || (el.querySelector && el.querySelector('img') !== null),
      isLink: el.tagName === 'A' || !!anchor,
      isHeading: /^H[1-6]$/.test(el.tagName),
      isRichText: el.tagName === 'P' || (el.tagName === 'DIV' && el.children.length > 1)
    };
  }
})();
`.trim();
}

/** @deprecated Use buildBridgeScript(pageSourceUrl) */
export const VISUAL_MAPPER_BRIDGE_SCRIPT = buildBridgeScript("");
