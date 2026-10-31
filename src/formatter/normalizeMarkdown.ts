import { protectCodeBlocks, restoreCodeBlocks } from "./protectCodeBlocks";
import { NON_LIST_INDENT } from "./listSyntax";
import { mapInlineText } from "./inlineSyntax";

/**
 * 見出しを ## 始まりに正規化する（コードブロック外のみ）
 * # → ##, ## → ###, ### → ####, #### → #####, ##### → ######
 * （###### は上限のため据え置き。h5 と h6 は同じ ###### になる）
 */
export function normalizeHeadings(markdown: string): string {
  const { protected: safe, store } = protectCodeBlocks(markdown);

  const normalized = safe.replace(/^(#{1,5}) /gm, (_, hashes: string) => {
    return "#".repeat(hashes.length + 1) + " ";
  });

  return restoreCodeBlocks(normalized, store);
}

/**
 * ## セクション間にだけ --- を挿入する（最初の ## の前は除く）
 * 既存の余計な --- は整理する
 */
export function insertSectionDividers(markdown: string): string {
  const { protected: safe, store } = protectCodeBlocks(markdown);

  // 既存の --- 行を削除（行頭スペースありも含む、コードブロック外）
  const cleaned = safe.replace(/^\s*---\s*$/gm, "").replace(/\n{3,}/g, "\n\n");

  // ## 見出しの直前に --- を挿入（最初の ## 以外）
  let firstH2Found = false;
  const lines = cleaned.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^## /.test(line)) {
      if (firstH2Found) {
        // 直前の空行を除去して --- を挿入
        while (result.length > 0 && result[result.length - 1].trim() === "") {
          result.pop();
        }
        result.push("", "---", "");
      }
      firstH2Found = true;
    }
    result.push(line);
  }

  return restoreCodeBlocks(result.join("\n"), store);
}

/**
 * 箇条書きを * に統一する（コードブロック外、表の区切り行は除く）
 */
export function normalizeBullets(markdown: string): string {
  const { protected: safe, store } = protectCodeBlocks(markdown);

  const normalized = safe.replace(/^(\s*)- /gm, (_, indent: string) => {
    return `${indent}* `;
  });

  return restoreCodeBlocks(normalized, store);
}

/**
 * Google Docs貼り付け向けのエスケープ（コードブロック外のみ）
 */
export function escapeForGoogleDocs(markdown: string): string {
  const { protected: safe, store } = protectCodeBlocks(markdown);

  // <...> をエスケープ（インラインコード・数式の中は対象外）
  const escaped = mapInlineText(safe, (text) => text.replace(/<([^<>\n]+)>/g, "\\<$1\\>"));

  return restoreCodeBlocks(escaped, store);
}

/**
 * 行頭の不要なスペース・タブを除去する（コードブロック外のみ）
 * ネストリスト（"  * "/"  - "）と番号付きリスト（"  1. "）のインデントは保持する
 */
export function normalizeIndent(markdown: string): string {
  const { protected: safe, store } = protectCodeBlocks(markdown);

  // 行頭スペース・タブがあり、直後がリストマーカーでない行はインデントを除去
  const normalized = safe.replace(NON_LIST_INDENT, "");

  return restoreCodeBlocks(normalized, store);
}

/**
 * 曲線ダブルクォート（" "）を日本語括弧（「 」）に置換する（コードブロック外のみ）
 */
export function replaceDoubleQuotes(markdown: string): string {
  const { protected: safe, store } = protectCodeBlocks(markdown);

  // " " (U+201C / U+201D) → 「 」
  const normalized = safe.replace(/\u201c([^\u201d]*)\u201d/g, "「$1」");

  return restoreCodeBlocks(normalized, store);
}

/**
 * 全正規化を一括適用する
 */
export function normalizeMarkdown(markdown: string): string {
  let result = markdown;
  result = normalizeBullets(result);
  result = insertSectionDividers(result);
  result = escapeForGoogleDocs(result);
  // 末尾の余分な空行を整理
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}
