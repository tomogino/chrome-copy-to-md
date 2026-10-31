/**
 * Markdown出力をHTMLに変換する（クリップボードHTML用）
 * Google Docsに貼り付けたときにインデントや箇条書きが崩れないよう
 * プレーンテキストではなくHTMLとしてコピーする。
 */

import { tokenizeInline } from "./inlineSyntax";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * * / ** / *** を対応する <em> / <strong> に変換する。
 * 開いている要素を内側から閉じるため、タグの入れ子は常に正しくなる。
 * 対応の取れない記号はそのまま残す。
 */
function emphasisToHtml(s: string): string {
  const out: string[] = [];
  const open: { kind: "em" | "strong"; at: number }[] = [];

  const parts = s.split(/(\*+)/);
  parts.forEach((part, i) => {
    if (!part.startsWith("*")) {
      out.push(part);
      return;
    }
    // 直前が空白でなければ閉じられ、直後が空白でなければ開ける（"a * b" の * は記号のまま）
    const canClose = /\S$/.test(parts[i - 1] ?? "");
    const canOpen = /^\S/.test(parts[i + 1] ?? "");
    let n = part.length;
    while (canClose && open.length > 0) {
      const top = open[open.length - 1];
      const size = top.kind === "em" ? 1 : 2;
      if (n < size) break;
      open.pop();
      out.push(`</${top.kind}>`);
      n -= size;
    }
    if (!canOpen) {
      if (n > 0) out.push("*".repeat(n));
      return;
    }
    const opening: ("em" | "strong")[] = n >= 3 ? ["strong", "em"] : n === 2 ? ["strong"] : n === 1 ? ["em"] : [];
    for (const kind of opening) {
      open.push({ kind, at: out.length });
      out.push(`<${kind}>`);
    }
    if (n > 3) out.push("*".repeat(n - 3));
  });

  for (const { kind, at } of open) out[at] = kind === "em" ? "*" : "**";
  return out.join("");
}

const LINK = /\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

/** インラインMarkdown → HTML */
function inlineToHtml(raw: string): string {
  // エスケープ・コードスパン・数式は中身を解釈しないよう退避する
  const slots: string[] = [];
  const hold = (html: string) => `\uE000${slots.push(html) - 1}\uE001`;

  let s = tokenizeInline(raw)
    .map((t) => {
      switch (t.type) {
        case "escape":
          return hold(escapeHtml(t.char));
        case "code":
          return hold(`<code>${escapeHtml(t.code)}</code>`);
        case "math":
          return hold(escapeHtml(t.raw));
        default:
          return escapeHtml(t.raw);
      }
    })
    .join("");

  // リンク（href 内の記号が強調として解釈されないよう、先に変換して退避）
  s = s.replace(LINK, (_, text: string, href: string) => hold(`<a href="${href.replace(/"/g, "&quot;")}">${emphasisToHtml(text)}</a>`));
  s = emphasisToHtml(s);

  // \u9000\u907F\u3057\u305F\u5185\u5BB9\u304C\u5165\u308C\u5B50\u306B\u306A\u3063\u3066\u3044\u308B\uFF08\u30EA\u30F3\u30AF\u5185\u306E\u30B3\u30FC\u30C9\u7B49\uFF09\u305F\u3081\u3001\u6B8B\u3089\u306A\u304F\u306A\u308B\u307E\u3067\u623B\u3059
  while (/\uE000\d+\uE001/.test(s)) {
    s = s.replace(/\uE000(\d+)\uE001/g, (_, i: string) => slots[Number(i)]);
  }
  return s;
}

const TABLE_SEPARATOR = /^\|(?:\s*:?-+:?\s*\|)+\s*$/;

/** 表の1行をセルに分割する（\| はセル内の | として扱う） */
function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

const CELL_STYLE = "border:1px solid #999;padding:4px 8px;";

function tableToHtml(rows: string[]): string {
  const [header, , ...body] = rows;
  const tr = (line: string, tag: "th" | "td") =>
    `<tr>${splitTableRow(line).map((c) => `<${tag} style="${CELL_STYLE}">${inlineToHtml(c)}</${tag}>`).join("")}</tr>`;
  return `<table style="border-collapse:collapse;">${tr(header, "th")}${body.map((l) => tr(l, "td")).join("")}</table>`;
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];

  let paraLines: string[] = [];
  let inCode = false;
  const codeLines: string[] = [];
  let codeLang = "";

  function flushPara() {
    if (paraLines.length === 0) return;
    const content = paraLines.map((l) => inlineToHtml(l)).join("<br>");
    out.push(`<p>${content}</p>`);
    paraLines = [];
  }

  function closeAll() {
    flushPara();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // コードブロック開始/終了
    if (line.startsWith("```")) {
      if (!inCode) {
        closeAll();
        inCode = true;
        codeLang = line.slice(3).trim();
        codeLines.length = 0;
      } else {
        const lang = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : "";
        out.push(`<pre><code${lang}>${codeLines.map(escapeHtml).join("\n")}</code></pre>`);
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    // 空行
    if (line.trim() === "") {
      closeAll();
      continue;
    }

    // 表（ヘッダー行 + 区切り行 | --- | で始まる連続した | 行）
    if (line.startsWith("|") && TABLE_SEPARATOR.test(lines[i + 1] ?? "")) {
      closeAll();
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      i--;
      out.push(tableToHtml(rows));
      continue;
    }

    // HR
    if (/^\s*---\s*$/.test(line)) {
      closeAll();
      out.push("<hr>");
      continue;
    }

    // 見出し
    const hMatch = line.match(/^(#{1,6}) (.+)$/);
    if (hMatch) {
      closeAll();
      const lvl = hMatch[1].length;
      const text = inlineToHtml(hMatch[2].trim());
      out.push(`<h${lvl}>${text}</h${lvl}>`);
      continue;
    }

    // 順序なしリスト → <ul><li> を使わず <p> + 記号にする
    // 理由: Google Docs で <ul><li> を使うとリストインデントが付き、
    //       「書式をクリア」すると段落インデントに変換されて残ってしまう
    const ulMatch = line.match(/^([ \t]*)[*\-] (.+)$/);
    if (ulMatch) {
      closeAll();
      const indent = Math.floor((ulMatch[1] || "").replace(/\t/g, "  ").length / 2);
      const prefix = "\u00a0\u00a0\u00a0\u00a0".repeat(indent) + "•\u00a0";
      // margin:0 で Google Docs のデフォルト段落間隔を詰める
      out.push(`<p style="margin:0;">${prefix}${inlineToHtml(ulMatch[2])}</p>`);
      continue;
    }

    // 順序付きリスト → 同様に <p> で出力
    const olMatch = line.match(/^([ \t]*)(\d+)[.)] (.+)$/);
    if (olMatch) {
      closeAll();
      const indent = Math.floor((olMatch[1] || "").replace(/\t/g, "  ").length / 2);
      const prefix = "\u00a0\u00a0\u00a0\u00a0".repeat(indent);
      out.push(`<p style="margin:0;">${prefix}${escapeHtml(olMatch[2])}.\u00a0${inlineToHtml(olMatch[3])}</p>`);
      continue;
    }

    // blockquote（ナレッジノートのUserラベル用）
    const bqMatch = line.match(/^> (.+)$/);
    if (bqMatch) {
      closeAll();
      out.push(`<blockquote><p>${inlineToHtml(bqMatch[1])}</p></blockquote>`);
      continue;
    }

    // 通常テキスト（段落として蓄積）
    paraLines.push(line);
  }

  closeAll();

  return `<html><body>${out.join("\n")}</body></html>`;
}
