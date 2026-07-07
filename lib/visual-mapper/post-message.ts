import type { ExtractedContent } from "@/types/visual-mapper";

export type IframeToParentMessage =
  | {
      type: "ELEMENT_SELECTED";
      selector: string;
      tagName: string;
      extracted: ExtractedContent;
      boundingRect: DOMRect;
    }
  | {
      type: "FIELD_VALUE_PICKED";
      fieldId: string;
      selector: string;
      content: ExtractedContent;
    };

export type ParentToIframeMessage =
  | { type: "ENABLE_PICK_MODE"; fieldId: string; preferImage?: boolean }
  | { type: "DISABLE_PICK_MODE" }
  | { type: "HIGHLIGHT_SELECTOR"; selector: string }
  | { type: "CLEAR_HIGHLIGHTS" };

export function isIframeMessage(data: unknown): data is IframeToParentMessage {
  if (typeof data !== "object" || data === null || !("type" in data)) {
    return false;
  }

  const type = (data as { type: unknown }).type;
  return (
    type === "ELEMENT_SELECTED" ||
    type === "FIELD_VALUE_PICKED"
  );
}

export function parseIframeMessage(data: unknown): IframeToParentMessage | null {
  if (!isIframeMessage(data)) {
    return null;
  }
  return data;
}
