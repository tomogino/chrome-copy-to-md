/**
 * Markdownリスト行の判定を1箇所に集約する。
 * htmlToMarkdown / normalizeIndent / formatSelection で同じ基準を使い、
 * リストのインデント（2スペース/階層）を変換全体で保持するため。
 */

/** リストマーカー（"* " "- " "1. " "1) "）。行頭インデントの直後に置かれる */
export const LIST_MARKER = String.raw`(?:[*\-]|\d+[.)])[ \t]`;

/**
 * リスト行以外の行頭インデントにマッチする（コードブロック保護後の文字列に使う）。
 * (?![ \t]) で行頭空白を必ず最後まで消費させ、バックトラックで
 * リスト行のインデントが1スペースずつ削られるのを防ぐ。
 */
export const NON_LIST_INDENT = new RegExp(String.raw`^[ \t]+(?![ \t])(?!${LIST_MARKER})`, "gm");

const INDENTED_LIST_LINE = new RegExp(String.raw`^[ \t]+${LIST_MARKER}`);
const LEADING_BLANK_LINES = /^(?:[^\S\n]*\n)+/;

/**
 * trim() と同じだが、先頭の内容行がインデント付きリスト行のときはそのインデントを残す。
 * 子リストの途中から選択した場合に、元の階層を維持するため。
 */
export function trimKeepingListIndent(text: string): string {
  const withoutBlankLines = text.replace(LEADING_BLANK_LINES, "");
  if (INDENTED_LIST_LINE.test(withoutBlankLines)) {
    return withoutBlankLines.trimEnd();
  }
  return text.trim();
}

export function startsWithIndentedListLine(text: string): boolean {
  return INDENTED_LIST_LINE.test(text.replace(LEADING_BLANK_LINES, ""));
}
