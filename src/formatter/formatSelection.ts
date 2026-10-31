import { htmlToMarkdown } from "./htmlToMarkdown";
import {
  normalizeHeadings,
  normalizeBullets,
  normalizeIndent,
  replaceDoubleQuotes,
  escapeForGoogleDocs,
  insertSectionDividers,
} from "./normalizeMarkdown";
import { trimKeepingListIndent } from "./listSyntax";

/** 各変換段階の結果を受け取るコールバック（デバッグ用・任意） */
export type StageTracer = (stage: string, value: string) => void;

/**
 * 選択範囲のHTMLをMarkdownに変換し正規化する（Knowledge Noteと同じパイプライン）
 */
export function formatSelection(html: string, trace?: StageTracer): string {
  let body = htmlToMarkdown(html);
  trace?.("htmlToMarkdown", body);
  body = normalizeHeadings(body);
  trace?.("normalizeHeadings", body);
  body = normalizeBullets(body);
  trace?.("normalizeBullets", body);
  body = normalizeIndent(body);
  trace?.("normalizeIndent", body);
  body = replaceDoubleQuotes(body);
  trace?.("replaceDoubleQuotes", body);
  body = escapeForGoogleDocs(body);
  trace?.("escapeForGoogleDocs", body);
  body = insertSectionDividers(body);
  trace?.("insertSectionDividers", body);
  return trimKeepingListIndent(body);
}
