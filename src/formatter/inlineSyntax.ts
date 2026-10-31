/**
 * インラインMarkdownのエスケープとトークン化を1箇所に集約する。
 * htmlToMarkdown（本文テキストのエスケープ）と markdownToHtml（解釈）で同じ規則を使い、
 * 本文中の記号がMarkdown記法として誤変換されたり、バックスラッシュが消えたりするのを防ぐ。
 *
 * 規則（CommonMark のサブセット）:
 * - "\" + ASCII記号 はその記号そのもの
 * - `code` / ``co`de`` はコードスパン（中身はそのまま）
 * - $tex$ / $$tex$$ は数式（中身はそのまま）
 */

const ESCAPABLE = /[!-/:-@[-`{-~]/;

/** 本文テキスト中で常にエスケープする記号（インライン記法の区切りになるもの） */
const INLINE_SPECIAL = /\\(?=[!-/:-@[-`{-~]|$)|[`*$[\]]/g;

/** 行頭でブロック記法（見出し・箇条書き・引用・表・区切り線）になる記号 */
const LINE_START_MARKER = /(^|\n)([ \t]*)(#{1,6}(?=[ \t]|$)|-(?=[ \t]|$)|-{3,}(?=[ \t]*(?:\n|$))|>|\|)/g;
const LINE_START_ORDERED = /(^|\n)([ \t]*\d+)([.)])(?=[ \t]|$)/g;

/**
 * DOM のテキストをMarkdown本文としてエスケープする。
 * atLineStart: テキストの先頭がMarkdownの行頭に来るか（見出しやli内の先頭は false）
 */
export function escapeMarkdownText(text: string, atLineStart: boolean): string {
  const escaped = text.replace(INLINE_SPECIAL, (m) => `\\${m}`);
  // 先頭が行頭でない場合は、テキスト内の改行以降だけを対象にする
  const head = atLineStart ? "" : "\u0000";
  return (head + escaped)
    .replace(LINE_START_MARKER, "$1$2\\$3")
    .replace(LINE_START_ORDERED, "$1$2\\$3")
    .slice(head.length);
}

/** コード文字列をコードスパンにする（中にバッククォートがあればより長い区切りを使う） */
export function codeSpan(code: string): string {
  if (code === "") return "";
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = /^`|`$/.test(code) ? " " : "";
  return `${fence}${pad}${code}${pad}${fence}`;
}

/** URL を Markdown のリンク先として安全な形にする（インライン記法の区切り文字を符号化） */
export function encodeLinkDestination(url: string): string {
  const encoded = url.replace(/[\s<>`$\\]/g, (c) => encodeURIComponent(c));
  // 括弧は対応が取れていれば残し、取れていなければ符号化する
  let depth = 0;
  for (const c of encoded) {
    if (c === "(") depth++;
    if (c === ")" && --depth < 0) break;
  }
  // encodeURIComponent は括弧を符号化しないため明示的に置換する
  return depth === 0 ? encoded : encoded.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

export type InlineToken =
  | { type: "text"; raw: string }
  | { type: "escape"; raw: string; char: string }
  | { type: "code"; raw: string; code: string }
  | { type: "math"; raw: string };

/** 同じ行内で、位置 from 以降にある区切り delim（前後に同じ文字が続かないもの）を探す */
function findCloser(src: string, start: number, delim: string): number {
  const lineEnd = src.indexOf("\n", start);
  const limit = lineEnd === -1 ? src.length : lineEnd;
  const ch = delim[0];
  for (let i = src.indexOf(delim, start); i !== -1 && i < limit; i = src.indexOf(delim, i + 1)) {
    if (src[i - 1] === "\\" && ch === "$") continue;
    if (ch === "`" && (src[i - 1] === "`" || src[i + delim.length] === "`")) continue;
    return i;
  }
  return -1;
}

/** インラインMarkdownを エスケープ / コードスパン / 数式 / テキスト に分解する */
export function tokenizeInline(src: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pushText = (s: string) => {
    const last = tokens[tokens.length - 1];
    if (last?.type === "text") last.raw += s;
    else tokens.push({ type: "text", raw: s });
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (ch === "\\" && i + 1 < src.length && ESCAPABLE.test(src[i + 1])) {
      tokens.push({ type: "escape", raw: src.slice(i, i + 2), char: src[i + 1] });
      i += 2;
      continue;
    }

    if (ch === "`") {
      const run = src.slice(i).match(/^`+/)![0];
      const close = findCloser(src, i + run.length, run);
      if (close === -1) {
        pushText(run);
        i += run.length;
        continue;
      }
      let code = src.slice(i + run.length, close);
      if (/^ .*[^ ].* $/s.test(code)) code = code.slice(1, -1);
      tokens.push({ type: "code", raw: src.slice(i, close + run.length), code });
      i = close + run.length;
      continue;
    }

    if (ch === "$") {
      const delim = src.startsWith("$$", i) ? "$$" : "$";
      const close = findCloser(src, i + delim.length, delim);
      if (close > i + delim.length) {
        tokens.push({ type: "math", raw: src.slice(i, close + delim.length) });
        i = close + delim.length;
        continue;
      }
    }

    pushText(ch);
    i++;
  }
  return tokens;
}

/** コードスパン・数式・エスケープを除いた本文部分だけに変換を適用する */
export function mapInlineText(src: string, fn: (text: string) => string): string {
  return tokenizeInline(src)
    .map((t) => (t.type === "text" ? fn(t.raw) : t.raw))
    .join("");
}
