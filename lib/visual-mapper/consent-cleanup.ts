/**
 * Removes cookie / privacy consent overlays in proxied pages so Visual Mapper
 * can interact with the underlying content.
 */

/** Selectors for common consent vendors and generic cookie banners. */
export const CONSENT_SELECTOR = [
  "#onetrust-consent-sdk",
  "#onetrust-banner-sdk",
  "#onetrust-pc-sdk",
  ".onetrust-pc-dark-filter",
  ".ot-sdk-container",
  "#CybotCookiebotDialog",
  "#CybotCookiebotDialogBodyUnderlay",
  ".cookiebot",
  "#truste-consent-track",
  ".truste_overlay",
  ".truste_box_overlay",
  "#truste-consent-content",
  ".qc-cmp2-container",
  "#qc-cmp2-main",
  ".osano-cm-window",
  ".osano-cm-dialog",
  "#didomi-host",
  "#didomi-notice",
  ".didomi-popup-backdrop",
  "#lanyard_root",
  "#usercentrics-root",
  "#cookie-law-info-bar",
  "#cookie-notice",
  ".cc-window",
  "#cookies-banner",
  "#gdpr-cookie-message",
  ".evidon-banner",
  "#sp-cc",
  "[id*='cookie-consent' i]",
  "[id*='cookie-banner' i]",
  "[id*='cookie-notice' i]",
  "[class*='cookie-consent' i]",
  "[class*='cookie-banner' i]",
  "[class*='CookieConsent' i]",
  "[class*='privacy-preference' i]",
  "[data-testid='cookie-banner']",
  "[aria-label*='cookie' i]",
  "[aria-label*='consent' i]",
].join(",");

export const CONSENT_CLEANUP_CSS = `
  ${CONSENT_SELECTOR.split(",")
    .map((s) => `${s.trim()}`)
    .join(",\n  ")} {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
    opacity: 0 !important;
    z-index: -1 !important;
  }
  html.contentpilot-scroll-unlock,
  body.contentpilot-scroll-unlock {
    overflow: auto !important;
    position: static !important;
    height: auto !important;
    pointer-events: auto !important;
  }
`.trim();

export const CONSENT_CLEANUP_SCRIPT = `
(function() {
  var SELECTOR = ${JSON.stringify(CONSENT_SELECTOR)};
  var SCROLL_LOCK_CLASSES = [
    "modal-open",
    "no-scroll",
    "overflow-hidden",
    "ot-body-scroll-lock",
    "cookie-modal-open",
  ];
  var scheduled = false;

  function unlockScroll() {
    var html = document.documentElement;
    var body = document.body;
    if (!html || !body) return;
    html.classList.add("contentpilot-scroll-unlock");
    body.classList.add("contentpilot-scroll-unlock");
    html.style.overflow = "";
    html.style.position = "";
    body.style.overflow = "";
    body.style.position = "";
    body.style.pointerEvents = "";
    SCROLL_LOCK_CLASSES.forEach(function(name) {
      html.classList.remove(name);
      body.classList.remove(name);
    });
  }

  function removeConsentNodes() {
    SELECTOR.split(",").forEach(function(part) {
      var sel = part.trim();
      if (!sel) return;
      try {
        document.querySelectorAll(sel).forEach(function(node) {
          node.remove();
        });
      } catch (err) {}
    });
    unlockScroll();
  }

  function runCleanup() {
    removeConsentNodes();
    unlockScroll();
  }

  function scheduleCleanup() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function() {
      scheduled = false;
      runCleanup();
    });
  }

  runCleanup();
  document.addEventListener("DOMContentLoaded", runCleanup);
  window.addEventListener("load", runCleanup);

  if (document.documentElement) {
    new MutationObserver(scheduleCleanup).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  setInterval(runCleanup, 1500);
})();
`.trim();

export function injectConsentCleanup(html: string): string {
  const injection =
    `<style id="contentpilot-consent-hide">${CONSENT_CLEANUP_CSS}</style>` +
    `<script>${CONSENT_CLEANUP_SCRIPT}</script>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${injection}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html[^>]*>/i,
      (match) => `${match}<head>${injection}</head>`,
    );
  }
  return `${injection}${html}`;
}
