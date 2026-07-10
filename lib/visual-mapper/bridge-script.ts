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
  let pickingPreferImage = false;
  let interactivityEnabled = false;
  let layerPickIndex = 0;
  let lastPickX = 0;
  let lastPickY = 0;

  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'ENABLE_PICK_MODE') {
      pickingMode = true;
      pickingFieldId = e.data.fieldId;
      pickingPreferImage = !!e.data.preferImage;
      document.body.style.cursor = 'crosshair';
    }
    if (e.data.type === 'DISABLE_PICK_MODE') {
      pickingMode = false;
      pickingFieldId = null;
      pickingPreferImage = false;
      document.body.style.cursor = '';
    }
    if (e.data.type === 'SET_INTERACTION_MODE') {
      interactivityEnabled = !!e.data.enabled;
      if (interactivityEnabled) {
        if (activeOverlay) {
          activeOverlay.style.outline = '';
          activeOverlay = null;
        }
        clearAllHighlights();
      }
    }
    if (e.data.type === 'HIGHLIGHT_SELECTOR') {
      highlightSelector(e.data.selector);
    }
    if (e.data.type === 'CLEAR_HIGHLIGHTS') {
      clearAllHighlights();
    }
  });

  document.addEventListener('mouseover', (e) => {
    if (pickingMode || interactivityEnabled) return;
    if (activeOverlay) activeOverlay.style.outline = '';
    const el = resolvePickTarget(e, false);
    el.style.outline = '2px solid #3B82F6';
    el.style.outlineOffset = '2px';
    activeOverlay = el;
    e.stopPropagation();
  });

  document.addEventListener('mouseout', (e) => {
    if (pickingMode || interactivityEnabled) return;
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

  function isPickableElement(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    return tag !== 'HTML' && tag !== 'BODY' && tag !== 'SCRIPT' && tag !== 'STYLE';
  }

  function getPickStack(x, y) {
    if (!document.elementsFromPoint) {
      return [];
    }
    return document.elementsFromPoint(x, y).filter(function(el) {
      return el instanceof Element && isPickableElement(el) && !isConsentTarget(el);
    });
  }

  function hasBackgroundImage(el) {
    try {
      const bg = window.getComputedStyle(el).backgroundImage;
      return Boolean(bg && bg !== 'none' && /url\\(/i.test(bg));
    } catch (err) {
      return false;
    }
  }

  function isHeroLikeContainer(el) {
    if (!el || !el.tagName) return false;
    if (isCardLikeItem(el)) {
      return false;
    }
    const tag = el.tagName;
    if (tag === 'SECTION' || tag === 'HEADER') {
      return true;
    }
    if (!el.classList) return false;
    return Array.from(el.classList).some(function(className) {
      return /hero|banner|jumbotron|masthead|cover/i.test(className);
    });
  }

  function isCardLikeItem(el) {
    if (!el || el.tagName !== 'ARTICLE') {
      return false;
    }
    if (el.closest && el.closest('[class*="grid"]')) {
      return true;
    }
    if (!el.classList) {
      return false;
    }
    return Array.from(el.classList).some(function(className) {
      return /card|tile|item|feature|promo|teaser|group/i.test(className);
    });
  }

  function findCardItemInStack(stack, fromIndex) {
    for (let i = fromIndex; i < stack.length; i += 1) {
      const el = stack[i];
      if (isCardLikeItem(el)) {
        return el;
      }
      if (el.closest) {
        const article = el.closest('article');
        if (article && isCardLikeItem(article)) {
          return article;
        }
      }
    }
    return null;
  }

  function cssEscapeIdent(value) {
    if (typeof CSS !== 'undefined' && CSS.escape) {
      return CSS.escape(String(value));
    }
    return String(value).replace(/[^\\w-]/g, function(char) {
      return '\\\\' + char.charCodeAt(0).toString(16) + ' ';
    });
  }

  function quoteAttrValue(value) {
    return '"' + String(value).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"') + '"';
  }

  function isHeadingElement(el) {
    return !!(el && el.tagName && /^H[1-6]$/.test(el.tagName));
  }

  function isRichTextContainer(el) {
    if (!el || !el.tagName) return false;
    if (el.classList) {
      var classNames = Array.from(el.classList);
      for (var i = 0; i < classNames.length; i += 1) {
        if (/^(rte|rich-?text|richtext|wysiwyg|prose)$/i.test(classNames[i]) || /rich-?text/i.test(classNames[i])) {
          return true;
        }
      }
    }
    var dataComponent = el.getAttribute && el.getAttribute('data-component');
    if (dataComponent && /rte|rich-?text|article-?body|blog-?body|blog-?rte|page-?content/i.test(dataComponent)) {
      return true;
    }
    var ariaLabel = el.getAttribute && el.getAttribute('aria-label');
    if (ariaLabel && /article body|rich text|main content|page content/i.test(ariaLabel)) {
      return true;
    }
    return false;
  }

  function findRichTextContainerInStack(stack, fromIndex) {
    for (var i = fromIndex; i < stack.length; i += 1) {
      if (isRichTextContainer(stack[i])) {
        return stack[i];
      }
    }
    return null;
  }

  function isPrimaryInteractivePickTarget(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName;
    return tag === 'BUTTON' || tag === 'A' || tag === 'IMG' || tag === 'SUMMARY';
  }

  function isInteractivePickTarget(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    if (isPrimaryInteractivePickTarget(el)) {
      return true;
    }
    if (isHeadingElement(el)) {
      return true;
    }
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'LABEL') {
      return true;
    }
    if (el.getAttribute && el.getAttribute('aria-controls')) {
      return true;
    }
    if (el.getAttribute && el.getAttribute('data-component')) {
      return true;
    }
    return false;
  }

  function findAccordionTrigger(el) {
    if (!el || !el.closest) return null;
    if (el.tagName === 'SUMMARY') {
      return el;
    }
    var summary = el.closest('summary');
    if (summary && summary.closest('details')) {
      return summary;
    }
    if (el.tagName === 'BUTTON' && el.getAttribute('aria-controls')) {
      return el;
    }
    return el.closest('button[aria-controls]');
  }

  function expandAccordionFromTrigger(trigger) {
    if (!trigger) return;

    var details = trigger.closest && trigger.closest('details');
    if (details) {
      details.open = true;
      return;
    }

    var panelId = trigger.getAttribute('aria-controls');
    if (!panelId) return;

    var panel = document.getElementById(panelId);
    if (!panel) return;

    trigger.setAttribute('aria-expanded', 'true');
    panel.classList.remove('hidden');
    panel.classList.add('block');
    panel.removeAttribute('hidden');
  }

  function findInteractiveTargetInStack(stack, fromIndex) {
    for (let i = fromIndex; i < stack.length; i += 1) {
      const el = stack[i];
      if (isInteractivePickTarget(el)) {
        return el;
      }
    }
    return null;
  }

  function findContainerInStack(stack, fromIndex) {
    for (let i = fromIndex; i < stack.length; i += 1) {
      const el = stack[i];
      if (hasBackgroundImage(el) || isHeroLikeContainer(el)) {
        return el;
      }
    }
    return null;
  }

  function findImageTargetInStack(stack) {
    for (let i = 0; i < stack.length; i += 1) {
      const el = stack[i];
      if (el.tagName === 'IMG' || hasBackgroundImage(el)) {
        return el;
      }
    }
    return null;
  }

  function resolvePickTarget(e, allowLayerCycle) {
    const stack = getPickStack(e.clientX, e.clientY);
    if (!stack.length) {
      return e.target;
    }

    if (allowLayerCycle && e.altKey) {
      const sameSpot =
        Math.abs(e.clientX - lastPickX) < 4 && Math.abs(e.clientY - lastPickY) < 4;
      if (!sameSpot) {
        layerPickIndex = 0;
        lastPickX = e.clientX;
        lastPickY = e.clientY;
      } else {
        layerPickIndex = (layerPickIndex + 1) % stack.length;
      }
      return stack[layerPickIndex] || e.target;
    }

    const targetIndex = Math.max(0, stack.indexOf(e.target));

    if (pickingMode && pickingPreferImage) {
      const imageTarget = findImageTargetInStack(stack);
      if (imageTarget) {
        return imageTarget;
      }
    }

    if (!pickingMode) {
      const cardItem = findCardItemInStack(stack, targetIndex);
      if (cardItem) {
        return cardItem;
      }

      const richText = findRichTextContainerInStack(stack, targetIndex);
      const interactive = findInteractiveTargetInStack(stack, targetIndex);

      if (richText) {
        if (
          !interactive ||
          isHeadingElement(interactive) ||
          isRichTextContainer(interactive) ||
          !isPrimaryInteractivePickTarget(interactive)
        ) {
          return richText;
        }
        return interactive;
      }

      if (interactive) {
        return interactive;
      }
      const container = findContainerInStack(stack, targetIndex);
      if (container) {
        return container;
      }
    }

    return e.target;
  }

  document.addEventListener('click', (e) => {
    if (isConsentTarget(e.target)) {
      return;
    }
    if (interactivityEnabled && !pickingMode) {
      var linkEl = findLinkElement(e.target);
      if (linkEl) {
        var navHref = extractHref(linkEl);
        if (
          navHref &&
          /^https?:\\/\\//i.test(navHref) &&
          navHref.indexOf('/api/proxy-page') === -1
        ) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href =
            window.location.origin +
            '/api/proxy-page?url=' +
            encodeURIComponent(navHref);
          return;
        }
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    var accordionTrigger = findAccordionTrigger(e.target);
    if (accordionTrigger) {
      expandAccordionFromTrigger(accordionTrigger);
    }

    const el = resolvePickTarget(e, true);
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

  function getNthOfTypeIndex(node) {
    var parent = node.parentElement;
    if (!parent) {
      return null;
    }
    var sameTag = Array.from(parent.children).filter(function(child) {
      return child.tagName === node.tagName;
    });
    if (sameTag.length <= 1) {
      return null;
    }
    return sameTag.indexOf(node) + 1;
  }

  function pickClassNamesForSelector(classList) {
    var cleaned = Array.from(classList || []).filter(function(c) {
      return c && !c.startsWith('migratex');
    });
    var semantic = cleaned.filter(function(c) {
      return /^(rte|rich-?text|richtext|wysiwyg|prose|content|card|hero|accordion|tile|feature)$/i.test(c);
    });
    if (semantic.length) {
      return semantic.slice(0, 2);
    }
    return cleaned.slice(0, 3);
  }

  function buildNodeSelector(node) {
    if (node.id) {
      try {
        return '#' + cssEscapeIdent(node.id);
      } catch (err) {
        return '#' + node.id;
      }
    }

    var tag = node.tagName.toLowerCase();
    var nth = getNthOfTypeIndex(node);
    var dataComponent = node.getAttribute && node.getAttribute('data-component');
    if (dataComponent && dataComponent.trim()) {
      tag += '[data-component=' + quoteAttrValue(dataComponent.trim()) + ']';
      if (nth && nth > 1) {
        tag += ':nth-of-type(' + nth + ')';
      }
      return tag;
    }

    var ariaLabel = node.getAttribute && node.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) {
      tag += '[aria-label=' + quoteAttrValue(ariaLabel.trim()) + ']';
      if (nth && nth > 1) {
        tag += ':nth-of-type(' + nth + ')';
      }
      return tag;
    }

    var classes = pickClassNamesForSelector(node.classList);
    if (classes.length) {
      tag += '.' + classes.map(function(c) { return cssEscapeIdent(c); }).join('.');
    }

    if (nth && nth > 1) {
      tag += ':nth-of-type(' + nth + ')';
    }

    return tag;
  }

  function getSelector(el) {
    if (!el || el.nodeType !== 1) {
      return '';
    }

    if (el.id) {
      try {
        var idSelector = '#' + cssEscapeIdent(el.id);
        if (document.querySelectorAll(idSelector).length === 1) {
          return idSelector;
        }
      } catch (err) {}
    }

    var dataComponent = el.getAttribute && el.getAttribute('data-component');
    if (dataComponent && dataComponent.trim()) {
      var attrOnly = '[data-component=' + quoteAttrValue(dataComponent.trim()) + ']';
      var taggedAttr = el.tagName.toLowerCase() + attrOnly;
      try {
        if (document.querySelectorAll(attrOnly).length === 1) {
          return attrOnly;
        }
        if (document.querySelectorAll(taggedAttr).length === 1) {
          return taggedAttr;
        }
      } catch (err) {}
    }

    var ariaLabel = el.getAttribute && el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) {
      var ariaSel = el.tagName.toLowerCase() + '[aria-label=' + quoteAttrValue(ariaLabel.trim()) + ']';
      try {
        if (document.querySelectorAll(ariaSel).length === 1) {
          return ariaSel;
        }
      } catch (err) {}
    }

    if (el.classList) {
      var semanticClasses = ['rte', 'rich-text', 'richtext', 'wysiwyg', 'prose'];
      for (var si = 0; si < semanticClasses.length; si += 1) {
        if (el.classList.contains(semanticClasses[si])) {
          var semSel = el.tagName.toLowerCase() + '.' + cssEscapeIdent(semanticClasses[si]);
          try {
            if (document.querySelectorAll(semSel).length === 1) {
              return semSel;
            }
          } catch (err) {}
        }
      }
    }

    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      parts.unshift(buildNodeSelector(node));
      if (node.id || (node.getAttribute && node.getAttribute('data-component'))) {
        break;
      }
      node = node.parentElement;
    }

    for (var start = 0; start < parts.length; start++) {
      var selector = parts.slice(start).join(' > ');
      try {
        var matches = document.querySelectorAll(selector);
        if (matches.length === 1 && matches[0] === el) {
          return selector;
        }
      } catch (err) {}
    }

    return parts.join(' > ');
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

  function findLinkElement(el) {
    if (!el) return null;
    if (el.tagName === 'A') return el;
    if (!el.closest) return null;
    var anchor = el.closest('a');
    if (anchor) return anchor;
    var roleLink = el.closest('[role="link"]');
    if (roleLink) return roleLink;
    return null;
  }

  function extractLinkText(el) {
    var linkEl = findLinkElement(el);
    if (linkEl) {
      return (linkEl.innerText && linkEl.innerText.trim().slice(0, 500)) || '';
    }
    return (el.innerText && el.innerText.trim().slice(0, 500)) || '';
  }

  function extractHref(el) {
    var linkEl = findLinkElement(el);
    if (linkEl) {
      var href = linkEl.getAttribute('href') || '';
      if (!href && linkEl.getAttribute('role') === 'link') {
        href = linkEl.getAttribute('data-href') || linkEl.getAttribute('data-url') || linkEl.getAttribute('data-link') || '';
      }
      return resolveNavigationHref(href);
    }
    var dataHref = el.getAttribute('data-href') || el.getAttribute('data-url') || el.getAttribute('data-link');
    if (dataHref) return resolveNavigationHref(dataHref);
    return '';
  }

  function extractLinkTarget(el) {
    var linkEl = findLinkElement(el);
    if (!linkEl) return '';
    return linkEl.getAttribute('target') || '';
  }

  function extractBackgroundImageUrl(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      try {
        const bg = window.getComputedStyle(node).backgroundImage;
        const match = bg && bg.match(/url\\(["']?(.+?)["']?\\)/);
        if (match && match[1]) {
          return resolveNavigationHref(unwrapProxiedUrl(match[1]));
        }
      } catch (err) {}

      const dataBg =
        node.getAttribute('data-bg') ||
        node.getAttribute('data-background') ||
        node.getAttribute('data-background-image') ||
        '';
      if (dataBg.trim()) {
        return resolveNavigationHref(unwrapProxiedUrl(dataBg.trim()));
      }

      node = node.parentElement;
    }
    return '';
  }

  function extractSrc(el) {
    var img = el.tagName === 'IMG' ? el : (el.querySelector ? el.querySelector('img') : null);
    var target = img || el;
    var raw = target.getAttribute('src') || target.getAttribute('data-src') || target.src || target.currentSrc || '';
    if (raw) {
      return resolveNavigationHref(unwrapProxiedUrl(raw));
    }
    return extractBackgroundImageUrl(el);
  }

  function extractFromElement(el) {
    var linkEl = findLinkElement(el);
    var backgroundSrc = extractBackgroundImageUrl(el);
    var src = extractSrc(el);
    var hasImgChild = el.tagName === 'IMG' || (el.querySelector && el.querySelector('img') !== null);
    return {
      text: extractLinkText(el),
      html: (function() {
        var raw = (el.innerHTML && el.innerHTML) || '';
        var limit = isRichTextContainer(el) ? 100000 : 1000;
        return raw.slice(0, limit);
      })(),
      src: src,
      href: extractHref(el),
      alt: el.alt || '',
      tagName: el.tagName,
      isImage: hasImgChild || Boolean(backgroundSrc),
      isLink: el.tagName === 'A' || !!linkEl,
      isHeading: /^H[1-6]$/.test(el.tagName),
      isRichText: isRichTextContainer(el) || el.tagName === 'P' || (el.tagName === 'DIV' && el.children.length > 1),
      linkTarget: extractLinkTarget(el)
    };
  }

  window.parent.postMessage({ type: 'BRIDGE_READY' }, '*');
})();
`.trim();
}

/** @deprecated Use buildBridgeScript(pageSourceUrl) */
export const VISUAL_MAPPER_BRIDGE_SCRIPT = buildBridgeScript("");
