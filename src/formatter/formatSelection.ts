import { htmlToMarkdown } from "./htmlToMarkdown";
import {
  normalizeHeadings,
  normalizeBullets,
  normalizeIndent,
  replaceDoubleQuotes,
  escapeForGoogleDocs,
  insertSectionDividers,
  collapseTextParagraphs,
} from "./normalizeMarkdown";

/**
 * 選択範囲のHTMLをMarkdownに変換し正規化する（Knowledge Noteと同じパイプライン）
 */
export function formatSelection(html: string): string {
  let body = htmlToMarkdown(html);
  body = normalizeHeadings(body);
  body = normalizeBullets(body);
  body = normalizeIndent(body);
  body = replaceDoubleQuotes(body);
  body = escapeForGoogleDocs(body);
  body = insertSectionDividers(body);
  body = collapseTextParagraphs(body);
  return body.trim();
}
