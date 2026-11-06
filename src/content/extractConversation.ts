import type { Conversation, ConversationMessage, MessageRole } from "../types/conversation";
import { CODE_VIEWER_SELECTOR } from "../formatter/codeBlockDom";

// DOMセレクタを1箇所に集約
const SELECTORS = {
  messageByRole: (role: MessageRole) => `[data-message-author-role="${role}"]`,
  allMessages: '[data-message-author-role]',
  messageContent: '.markdown, .whitespace-pre-wrap, [class*="prose"]',
} as const;

/**
 * メッセージ要素からテキストとHTMLを抽出する
 */
function extractMessageContent(el: Element): { text: string; html: string } {
  // コンテンツ領域を探す（優先度順）
  const contentEl =
    el.querySelector(".markdown") ||
    el.querySelector('[class*="prose"]') ||
    el.querySelector(".whitespace-pre-wrap") ||
    el;

  // UIボタン等を除外するためcloneを使う
  const clone = contentEl.cloneNode(true) as Element;

  // ボタン・アイコン類を削除
  clone.querySelectorAll('button, [role="button"], svg, [aria-label]').forEach((node) => {
    node.remove();
  });

  const html = clone.innerHTML.trim();
  const text = (clone.textContent || "").trim();

  return { text, html };
}

/**
 * ページ上で選択中のテキスト範囲をHTMLとして取得する
 */
export function extractSelection(): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    throw new Error("テキストが選択されていません。ChatGPTページでコピーしたい範囲を選択してから実行してください。");
  }
  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();
  const div = document.createElement("div");
  div.appendChild(fragment);
  // ボタン・アイコン類を除去（extractMessageContent と同様）
  div.querySelectorAll('button, [role="button"], svg, [aria-label]').forEach((el) => el.remove());

  // コードブロックの内側だけを選択すると断片に親要素が含まれないため、コードとして包み直す
  const ancestor = range.commonAncestorContainer;
  const ancestorEl = ancestor.nodeType === Node.ELEMENT_NODE ? (ancestor as Element) : ancestor.parentElement;
  if (ancestorEl?.closest(`pre, ${CODE_VIEWER_SELECTOR}`)) {
    return `<pre><code>${div.innerHTML}</code></pre>`;
  }
  return div.innerHTML;
}

/**
 * ChatGPT画面から会話を抽出する
 */
export function extractConversation(): Conversation {
  const messageElements = document.querySelectorAll(SELECTORS.allMessages);

  if (messageElements.length === 0) {
    throw new Error(
      "会話が見つかりませんでした。ChatGPTの会話ページを開いてから再試行してください。"
    );
  }

  const messages: ConversationMessage[] = [];
  let userCount = 0;
  let assistantCount = 0;

  messageElements.forEach((el) => {
    const role = el.getAttribute("data-message-author-role") as MessageRole | null;
    if (role !== "user" && role !== "assistant") return;

    const { text, html } = extractMessageContent(el);
    if (!text) return;

    const index = role === "user" ? ++userCount : ++assistantCount;

    messages.push({ role, index, text, html });
  });

  if (messages.length === 0) {
    throw new Error("会話メッセージを抽出できませんでした。");
  }

  // インデックスを通し番号で振り直す（user/assistantペアで同じ番号に）
  let pairIndex = 0;
  let lastRole: MessageRole | null = null;
  const reindexed = messages.map((msg) => {
    if (msg.role === "user" && lastRole !== "user") {
      pairIndex++;
    }
    lastRole = msg.role;
    return { ...msg, index: pairIndex };
  });

  return {
    title: document.title.replace(" - ChatGPT", "").trim() || undefined,
    url: location.href,
    exportedAt: new Date().toISOString(),
    messages: reindexed,
  };
}
