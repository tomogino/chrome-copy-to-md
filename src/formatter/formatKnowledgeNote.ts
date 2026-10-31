import type { Conversation } from "../types/conversation";
import { htmlToMarkdown } from "./htmlToMarkdown";
import {
  normalizeHeadings,
  normalizeBullets,
  normalizeIndent,
  replaceDoubleQuotes,
  insertSectionDividers,
  escapeForGoogleDocs,
  collapseTextParagraphs,
} from "./normalizeMarkdown";

/**
 * 内容の薄い短いUser発言を除外するパターン
 */
const TRIVIAL_USER_PATTERNS = [
  /^続けて(ください)?[。！!]?$/,
  /^なるほど[。！!]?$/,
  /^OK[。！!]?$/i,
  /^ありがとう(ございます)?[。！!]?$/,
  /^それで[。！!]?$/,
  /^次[。！!]?$/,
  /^お願いします[。！!]?$/,
  /^はい[。！!]?$/,
  /^わかりました[。！!]?$/,
];

function isTrivialUserMessage(text: string): boolean {
  const trimmed = text.trim();
  return TRIVIAL_USER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * 知識ノート形式に整形する
 */
export function formatKnowledgeNote(conversation: Conversation): string {
  const parts: string[] = [];

  for (const msg of conversation.messages) {
    if (msg.role === "user") {
      if (isTrivialUserMessage(msg.text)) continue;

      // > blockquote ではなく **User:** ラベルとして残す
      parts.push(`**User:** ${msg.text.trim()}`);
      continue;
    }

    let body = msg.html ? htmlToMarkdown(msg.html) : msg.text;

    body = normalizeHeadings(body);
    body = normalizeBullets(body);
    body = normalizeIndent(body);
    body = replaceDoubleQuotes(body);
    body = escapeForGoogleDocs(body);

    parts.push(body.trim());
  }

  let result = parts.join("\n").replace(/\n{3,}/g, "\n\n");
  result = insertSectionDividers(result);
  result = collapseTextParagraphs(result);

  return result.trim();
}
