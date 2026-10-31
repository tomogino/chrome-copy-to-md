import type { CopyMode, ExtractResult } from "../types/conversation";
import { formatConversationLog } from "../formatter/formatConversationLog";
import { formatKnowledgeNote } from "../formatter/formatKnowledgeNote";
import { formatSelection } from "../formatter/formatSelection";
import { markdownToHtml } from "../formatter/markdownToHtml";

type StatusType = "idle" | "loading" | "success" | "error";

function setStatus(message: string, type: StatusType): void {
  const statusEl = document.getElementById("status");
  const statusText = document.getElementById("status-text");
  if (!statusEl || !statusText) return;
  statusEl.className = `status status-${type}`;
  statusText.textContent = message;
}

function setButtonsDisabled(disabled: boolean): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".btn");
  buttons.forEach((btn) => {
    btn.disabled = disabled;
  });
}

/**
 * ChatGPTタブから会話を取得してMarkdownとHTMLに変換する。
 * navigator.clipboard.write() に渡す Promise-based Blob の解決関数として使う。
 */
async function buildContent(mode: CopyMode): Promise<{ markdown: string; html: string; modeLabel: string; msgCount: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.id) throw new Error("タブが取得できませんでした");

  const url = tab.url || "";
  if (!url.includes("chatgpt.com") && !url.includes("chat.openai.com")) {
    throw new Error("ChatGPTのページを開いてから使用してください");
  }

  let result: ExtractResult;
  try {
    result = await chrome.tabs.sendMessage<{ mode: CopyMode }, ExtractResult>(tab.id, { mode });
  } catch (connErr) {
    const msg = connErr instanceof Error ? connErr.message : "";
    if (
      msg.includes("Could not establish connection") ||
      msg.includes("Receiving end does not exist")
    ) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/contentScript.js"],
      });
      result = await chrome.tabs.sendMessage<{ mode: CopyMode }, ExtractResult>(tab.id, { mode });
    } else {
      throw connErr;
    }
  }

  if (!result.success) {
    throw new Error(result.error || "取得に失敗しました");
  }

  if (mode === "selectionCopy") {
    if (!result.selectionHtml) throw new Error("選択範囲を取得できませんでした");
    const markdown = formatSelection(result.selectionHtml);
    const html = markdownToHtml(markdown);
    return { markdown, html, modeLabel: "Selection", msgCount: 0 };
  }

  if (!result.conversation) {
    throw new Error(result.error || "会話の取得に失敗しました");
  }

  const markdown =
    mode === "conversationLog"
      ? formatConversationLog(result.conversation)
      : formatKnowledgeNote(result.conversation);

  const html = markdownToHtml(markdown);

  const modeLabel = mode === "conversationLog" ? "Conversation Log" : "Knowledge Note";
  const msgCount = result.conversation.messages.length;
  return { markdown, html, modeLabel, msgCount };
}

async function handleCopy(mode: CopyMode): Promise<void> {
  setButtonsDisabled(true);
  setStatus("会話を取得中...", "loading");

  try {
    // コンテンツ生成 Promise をここで起動するが、まだ await しない
    const contentPromise = buildContent(mode);

    // ClipboardItem が使える環境では navigator.clipboard.write() を
    // handleCopy の最初の await として呼ぶ（user activation を保持するため）。
    // Promise-based Blob を渡すことで、内容の生成を非同期で待ちながら
    // クリップボード書き込みをアクティベーション有効期間内に開始できる。
    if (typeof ClipboardItem !== "undefined") {
      let clipboardOk = false;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": contentPromise.then(
              ({ html }) => new Blob([html], { type: "text/html" })
            ),
            "text/plain": contentPromise.then(
              ({ markdown }) => new Blob([markdown], { type: "text/plain" })
            ),
          }),
        ]);
        clipboardOk = true;
      } catch (e) {
        console.warn("[CopyChatGPT] ClipboardItem 失敗:", e);
      }

      if (clipboardOk) {
        const { modeLabel, msgCount } = await contentPromise;
        const countLabel = msgCount > 0 ? `（${msgCount}件）` : "";
        setStatus(`✓ ${modeLabel} をコピーしました${countLabel}`, "success");
        setTimeout(() => setStatus("準備完了", "idle"), 3000);
        return;
      }
    }

    // フォールバック: plain text のみ
    const { markdown, modeLabel, msgCount } = await contentPromise;
    await navigator.clipboard.writeText(markdown);
    setStatus(`✓ ${modeLabel} をコピーしました（テキスト形式）`, "success");
    setTimeout(() => setStatus("準備完了", "idle"), 3000);
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました";
    setStatus(`✗ ${message}`, "error");
  } finally {
    setButtonsDisabled(false);
  }
}

document.getElementById("btn-conversation-log")?.addEventListener("click", () => {
  handleCopy("conversationLog");
});
document.getElementById("btn-knowledge-note")?.addEventListener("click", () => {
  handleCopy("knowledgeNote");
});
document.getElementById("btn-selection-copy")?.addEventListener("click", () => {
  handleCopy("selectionCopy");
});
