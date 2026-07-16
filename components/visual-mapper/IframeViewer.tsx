"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseIframeMessage,
  type ParentToIframeMessage,
} from "@/lib/visual-mapper/post-message";
import {
  extractVisualMapperSourceLanguages,
  saveVisualMapperSourceLanguages,
} from "@/lib/visual-mapper/source-page-languages";
import { useVisualMapperStore } from "@/lib/visual-mapper/store";
import type { FieldAssignment } from "@/types/visual-mapper";
import type { SourcePageLanguage } from "@/types/language";

const IMAGE_FIELD_PATTERN = /\b(image|photo|media|thumbnail|picture|banner)\b/i;

function fieldPrefersImagePick(field: FieldAssignment | undefined): boolean {
  if (!field) {
    return false;
  }
  return (
    field.fieldType.toLowerCase().includes("image") ||
    IMAGE_FIELD_PATTERN.test(field.sitecoreField)
  );
}

interface IframeViewerProps {
  sourceUrl: string;
  highlightSelector?: string | null;
  onSourceLanguagesChecked?: (result: {
    pageUrl: string;
    languages: SourcePageLanguage;
  }) => void;
}

export function IframeViewer({
  sourceUrl,
  highlightSelector,
  onSourceLanguagesChecked,
}: IframeViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loadErrorState, setLoadErrorState] = useState<{
    url: string;
    message: string;
  } | null>(null);
  const [languageStatus, setLanguageStatus] = useState<string | null>(null);
  const loadError =
    loadErrorState?.url === sourceUrl ? loadErrorState.message : null;

  const mappingPhase = useVisualMapperStore((s) => s.mappingPhase);
  const setSelectedElement = useVisualMapperStore((s) => s.setSelectedElement);
  const assignFieldFromPick = useVisualMapperStore((s) => s.assignFieldFromPick);
  const setActiveFieldId = useVisualMapperStore((s) => s.setActiveFieldId);
  const pageLoaded = useVisualMapperStore((s) => s.pageLoaded);
  const pageLoadFailed = useVisualMapperStore((s) => s.pageLoadFailed);
  const activeFieldId = useVisualMapperStore((s) => s.activeFieldId);
  const draftFieldAssignments = useVisualMapperStore((s) => s.draftFieldAssignments);
  const sessionStatus = useVisualMapperStore((s) => s.session.status);
  const pageInteractivityEnabled = useVisualMapperStore(
    (s) => s.pageInteractivityEnabled,
  );

  const activeField = draftFieldAssignments.find(
    (field) => field.sitecoreField === activeFieldId,
  );

  const bridgeStateRef = useRef({
    pageInteractivityEnabled,
    activeFieldId,
    activeField,
    highlightSelector,
  });

  useEffect(() => {
    bridgeStateRef.current = {
      pageInteractivityEnabled,
      activeFieldId,
      activeField,
      highlightSelector,
    };
  }, [
    pageInteractivityEnabled,
    activeFieldId,
    activeField,
    highlightSelector,
  ]);

  const postToIframe = useCallback((message: ParentToIframeMessage) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  const syncBridgeState = useCallback(() => {
    const state = bridgeStateRef.current;
    postToIframe({
      type: "SET_INTERACTION_MODE",
      enabled: state.pageInteractivityEnabled,
    });

    if (state.activeFieldId) {
      postToIframe({
        type: "ENABLE_PICK_MODE",
        fieldId: state.activeFieldId,
        preferImage: fieldPrefersImagePick(state.activeField),
      });
    } else {
      postToIframe({ type: "DISABLE_PICK_MODE" });
    }

    if (state.highlightSelector) {
      postToIframe({
        type: "HIGHLIGHT_SELECTOR",
        selector: state.highlightSelector,
      });
    } else {
      postToIframe({ type: "CLEAR_HIGHLIGHTS" });
    }
  }, [postToIframe]);

  useEffect(() => {
    if (!sourceUrl) {
      return;
    }

    let cancelled = false;

    async function preflight() {
      setLanguageStatus("Detecting languages on loaded page…");

      try {
        const response = await fetch(
          `/api/proxy-page?url=${encodeURIComponent(sourceUrl)}`,
        );
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          const rateLimited = response.status === 429 || response.status === 503;
          setLoadErrorState({
            url: sourceUrl,
            message:
              payload.error ??
              (rateLimited
                ? "The target site rate-limited this request. Wait a moment and reload."
                : "Proxy returned an error."),
          });
          pageLoadFailed();
          return;
        }

        const html = await response.text();
        if (cancelled) {
          return;
        }

        const languages = extractVisualMapperSourceLanguages(html, sourceUrl);
        saveVisualMapperSourceLanguages(sourceUrl, languages);

        if (languages.availableLanguages.length > 0) {
          setLanguageStatus(
            `Page languages: ${languages.availableLanguages.join(", ")}`,
          );
        } else {
          setLanguageStatus(
            "No page languages detected from HTML/URL. Review can still use English.",
          );
        }

        onSourceLanguagesChecked?.({
          pageUrl: sourceUrl,
          languages,
        });
      } catch {
        if (!cancelled) {
          setLoadErrorState({
            url: sourceUrl,
            message: "Failed to reach the proxy service.",
          });
          pageLoadFailed();
        }
      }
    }

    void preflight();

    return () => {
      cancelled = true;
    };
  }, [sourceUrl, reloadNonce, pageLoadFailed, onSourceLanguagesChecked]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const message = parseIframeMessage(event.data);
      if (!message) {
        return;
      }

      if (message.type === "BRIDGE_READY") {
        syncBridgeState();
        return;
      }

      if (message.type === "ELEMENT_SELECTED") {
        if (bridgeStateRef.current.pageInteractivityEnabled) {
          return;
        }
        if (mappingPhase !== "select-component" && !activeFieldId) {
          return;
        }
        setSelectedElement({
          selector: message.selector,
          tagName: message.tagName,
          extracted: message.extracted,
          boundingRect: message.boundingRect,
        });
      }

      if (message.type === "FIELD_VALUE_PICKED") {
        assignFieldFromPick(
          message.fieldId,
          message.content,
          message.selector,
        );
        setActiveFieldId(null);
        postToIframe({ type: "DISABLE_PICK_MODE" });
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    assignFieldFromPick,
    postToIframe,
    setActiveFieldId,
    setSelectedElement,
    syncBridgeState,
    mappingPhase,
    activeFieldId,
  ]);

  useEffect(() => {
    syncBridgeState();
  }, [
    activeField,
    activeFieldId,
    highlightSelector,
    pageInteractivityEnabled,
    syncBridgeState,
  ]);

  function handleIframeLoad() {
    setLoadErrorState(null);
    pageLoaded();
    syncBridgeState();
  }

  function handleIframeError() {
    setLoadErrorState({
      url: sourceUrl,
      message: "Failed to load the proxied page.",
    });
    pageLoadFailed();
  }

  const proxySrc = sourceUrl
    ? `/api/proxy-page?url=${encodeURIComponent(sourceUrl)}`
    : "";

  const showLoading =
    Boolean(sourceUrl) &&
    sessionStatus === "loading" &&
    !loadError;

  return (
    <div className="relative h-full w-full bg-zinc-100">
      {showLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-100">
          <div className="space-y-3 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-sm text-zinc-600">Loading page via proxy…</p>
            {languageStatus && (
              <p className="mx-auto max-w-sm text-xs text-zinc-500">
                {languageStatus}
              </p>
            )}
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-rose-50 p-6">
          <div className="max-w-md rounded-xl border border-rose-200 bg-white p-5 text-center">
            <p className="text-sm font-semibold text-rose-900">Could not load page</p>
            <p className="mt-2 text-sm text-rose-700">{loadError}</p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-800"
              onClick={() => {
                setLoadErrorState(null);
                setReloadNonce((value) => value + 1);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {sourceUrl && !loadError ? (
        <iframe
          key={`${sourceUrl}::${reloadNonce}`}
          ref={iframeRef}
          src={proxySrc}
          title="Visual Mapper page preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
          className="h-full w-full border-0 bg-white"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      ) : !sourceUrl ? (
        <div className="flex h-full items-center justify-center p-8 text-center">
          <div>
            <p className="text-sm font-medium text-zinc-700">No page loaded</p>
            <p className="mt-1 text-sm text-zinc-500">
              Enter a source URL above and click Load Page.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
