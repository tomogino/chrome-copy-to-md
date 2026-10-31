import { extractConversation, extractSelection } from "./extractConversation";
import type { CopyRequest, CopyResponse, ExtractResult } from "../types/conversation";

// Popupからのメッセージを受け取る
chrome.runtime.onMessage.addListener(
  (request: CopyRequest, _sender, sendResponse: (response: ExtractResult) => void) => {
    if (request.mode === "conversationLog" || request.mode === "knowledgeNote") {
      try {
        const conversation = extractConversation();
        sendResponse({ success: true, conversation });
      } catch (err) {
        const message = err instanceof Error ? err.message : "不明なエラーが発生しました";
        sendResponse({ success: false, error: message });
      }
      return true;
    }

    if (request.mode === "selectionCopy") {
      try {
        const selectionHtml = extractSelection();
        sendResponse({ success: true, selectionHtml });
      } catch (err) {
        const message = err instanceof Error ? err.message : "不明なエラーが発生しました";
        sendResponse({ success: false, error: message });
      }
      return true;
    }
  }
);
