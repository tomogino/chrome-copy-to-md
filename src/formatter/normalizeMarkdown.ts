import { protectCodeBlocks, restoreCodeBlocks } from "./protectCodeBlocks";

/**
 * 見出しを ## 始まりに正規化する（コードブロック外のみ）
 * # → ##, ## → ###, ### → ####, #### → #####
 */
export function normalizeHeadings(markdown: string): string {
  const { protected: safe, store } = protectCodeBlocks(markdown);

  const normalized = safe.replace(/^(#{1,4}) /gm, (_, hashes: string) => {
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

  let escaped = safe;

  // <...> をエスケープ（URLやインラインコード外）
  escaped = escaped.replace(/(?<!`[^`]*)(<)([^>]+)(>)(?![^`]*`)/g, "\\<$2\\>");

  // インラインコードを保護してから処理済みのものを戻す（簡易版: インラインコードは除外）
  // ※ 行中の `code` 内は変換しない（バッククォートで囲まれた部分を保護）
  escaped = escaped.replace(/`[^`]+`/g, (match) => match); // no-op: すでに保護外

  return restoreCodeBlocks(escaped, store);
}

/**
 * 行頭の不要なスペース・タブを除去する（コードブロック外のみ）
 * ネストリスト（"  * "/"  - "）と番号付きリスト（"  1. "）のインデントは保持する
 */
export function normalizeIndent(markdown: string): string {
  const { protected: safe, store } = protectCodeBlocks(markdown);

  // 行頭スペース・タブがあり、直後が * - 数字 でない行はインデントを除去
  const normalized = safe.replace(/^[ \t]+(?![*\-\d])/gm, "");

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

/** 構造行（見出し・リスト・区切り等）かどうか判定する */
function isStructuralLine(line: string): boolean {
  return (
    line === "" ||
    /^#{1,6} /.test(line) ||
    /^\s*[*\-] /.test(line) ||
    /^\s*\d+[\.\)] /.test(line) ||
    /^\s*---\s*$/.test(line) ||
    line.startsWith("|") ||
    line.startsWith("```") ||
    line.startsWith("\x00") || // コードブロックプレースホルダー
    line.startsWith("**User:**")
  );
}

/**
 * 通常テキスト段落同士の改行・空行を除去して1行に結合する（コードブロック外のみ）
 *
 * - 見出し・リスト・--- の前後の空行は保持する
 * - 連続する通常テキスト行はそのまま結合する（改行なし）
 * - 通常テキスト間の空行も除去して結合する
 */
export function collapseTextParagraphs(markdown: string): string {
  const { protected: safe, store } = protectCodeBlocks(markdown);
  const lines = safe.split("\n");
  const acc: string[] = [];

  for (const line of lines) {
    if (acc.length === 0) {
      acc.push(line);
      continue;
    }

    const prev = acc[acc.length - 1];

    // 空行: そのまま積む
    if (line === "") {
      acc.push(line);
      continue;
    }

    // 現在行が構造行: そのまま積む
    if (isStructuralLine(line)) {
      acc.push(line);
      continue;
    }

    // 現在行が通常テキスト
    if (prev === "") {
      // 直前が空行 → その前の行を確認
      const prevPrev = acc.length >= 2 ? acc[acc.length - 2] : "";
      if (!isStructuralLine(prevPrev) && prevPrev !== "") {
        // 空行の前も通常テキスト → 空行を除去して結合
        acc.pop();
        acc[acc.length - 1] += line;
      } else {
        // 空行の前が構造行 or 先頭 → 空行は保持してテキストを追加
        acc.push(line);
      }
    } else if (!isStructuralLine(prev)) {
      // 直前も通常テキスト → 改行なしで結合
      acc[acc.length - 1] += line;
    } else {
      acc.push(line);
    }
  }

  return restoreCodeBlocks(acc.join("\n"), store);
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
