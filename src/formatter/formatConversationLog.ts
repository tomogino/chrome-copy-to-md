import type { Conversation } from "../types/conversation";
import { htmlToMarkdown } from "./htmlToMarkdown";
import { normalizeBullets, normalizeIndent, replaceDoubleQuotes, escapeForGoogleDocs } from "./normalizeMarkdown";
import { protectCodeBlocks, restoreCodeBlocks } from "./protectCodeBlocks";
import { escapeMarkdownText } from "./inlineSyntax";

/**
 * Assistant本文内の見出しを1段階下げる
 * （会話ログの ### ターン見出しと衝突しないよう #### 以下に）
 */
function shiftAssistantHeadings(markdown: string): string {
  const { protected: safe, store } = protectCodeBlocks(markdown);

  // # → ##, ## → ###, etc.（最大5段階まで）
  const shifted = safe.replace(/^(#{1,5}) /gm, (_, hashes: string) => {
    return "#".repeat(hashes.length + 1) + " ";
  });

  return restoreCodeBlocks(shifted, store);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 会話ログ形式に整形する
 *
 * ## Conversation Log
 * ### 01｜User
 * 本文
 * ### 01｜Assistant
 * 本文
 */
export function formatConversationLog(conversation: Conversation): string {
  const parts: string[] = ["## Conversation Log", ""];

  for (const msg of conversation.messages) {
    const label = `### ${pad(msg.index)}｜${msg.role === "user" ? "User" : "Assistant"}`;
    parts.push(label, "");

    // HTMLがあればHTMLから変換、なければtextをそのまま使う
    let body = msg.html ? htmlToMarkdown(msg.html) : escapeMarkdownText(msg.text, true);

    if (msg.role === "assistant") {
      // Assistantの見出しを1段階下げる（### ターン見出しとの衝突を回避）
      body = shiftAssistantHeadings(body);
    }

    body = normalizeBullets(body);
    body = normalizeIndent(body);
    body = replaceDoubleQuotes(body);
    body = escapeForGoogleDocs(body);

    parts.push(body.trim(), "");
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
