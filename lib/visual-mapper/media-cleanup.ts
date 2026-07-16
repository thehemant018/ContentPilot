/**
 * Pauses autoplay video/audio in proxied pages so Visual Mapper stays usable.
 */

export const MEDIA_CLEANUP_SCRIPT = `
(function() {
  var EMBED_HOSTS = /youtube\\.com|youtu\\.be|vimeo\\.com|player\\.vimeo|wistia\\.com|vidyard\\.com|dailymotion\\.com/i;

  function stripAutoplayFromUrl(url) {
    try {
      var parsed = new URL(url, window.location.href);
      parsed.searchParams.set("autoplay", "0");
      parsed.searchParams.delete("mute");
      if (/youtube\\.com|youtu\\.be/i.test(parsed.hostname)) {
        parsed.searchParams.set("autoplay", "0");
      }
      return parsed.href;
    } catch (err) {
      return url.replace(/([?&])autoplay=1/gi, "$1autoplay=0");
    }
  }

  function pauseMediaElement(el) {
    if (!el) return;
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag !== "video" && tag !== "audio") return;

    try {
      el.autoplay = false;
      el.loop = false;
      el.muted = true;
      el.defaultMuted = true;
      el.removeAttribute("autoplay");
      el.removeAttribute("loop");
      el.setAttribute("muted", "");
      el.setAttribute("playsinline", "");
      el.setAttribute("preload", "metadata");
      if (typeof el.pause === "function") el.pause();
      el.currentTime = 0;
    } catch (err) {}
  }

  function pauseEmbedFrame(el) {
    if (!el || el.tagName !== "IFRAME") return;
    var src = el.getAttribute("src") || "";
    if (!src || !EMBED_HOSTS.test(src)) return;
    try {
      var next = stripAutoplayFromUrl(src);
      if (next !== src) el.setAttribute("src", next);
    } catch (err) {}
    try {
      el.contentWindow && el.contentWindow.postMessage(
        '{"event":"command","func":"pauseVideo","args":""}',
        "*"
      );
    } catch (err) {}
  }

  function pauseAllMedia(root) {
    var node = root || document;
    if (!node.querySelectorAll) return;
    node.querySelectorAll("video,audio").forEach(pauseMediaElement);
    node.querySelectorAll("iframe").forEach(pauseEmbedFrame);
  }

  if (typeof HTMLMediaElement !== "undefined") {
    var origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      pauseMediaElement(this);
      return Promise.resolve();
    };
  }

  pauseAllMedia(document);
  document.addEventListener("DOMContentLoaded", function() { pauseAllMedia(document); });
  window.addEventListener("load", function() { pauseAllMedia(document); });

  var scheduled = false;
  function schedulePause() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function() {
      scheduled = false;
      pauseAllMedia(document);
    });
  }

  new MutationObserver(schedulePause).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "autoplay", "loop"],
  });

  setInterval(function() { pauseAllMedia(document); }, 2500);
})();
`.trim();

export function injectMediaCleanup(html: string): string {
  const injection = `<script id="contentpilot-media-cleanup">${MEDIA_CLEANUP_SCRIPT}</script>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${injection}`);
  }
  return `${injection}${html}`;
}
