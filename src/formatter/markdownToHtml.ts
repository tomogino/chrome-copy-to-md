/**
 * Markdown出力をHTMLに変換する（クリップボードHTML用）
 * Google Docsに貼り付けたときにインデントや箇条書きが崩れないよう
 * プレーンテキストではなくHTMLとしてコピーする。
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** escapeForGoogleDocs で追加したエスケープを戻す */
function unescapeMd(text: string): string {
  return text
    .replace(/\\</g, "<")
    .replace(/\\>/g, ">")
    .replace(/\\\./g, ".")
    .replace(/\\-/g, "-");
}

/** インラインMarkdown → HTML */
function inlineToHtml(raw: string): string {
  // HTMLエスケープしてからインライン要素を変換
  let s = escapeHtml(raw);
  // インラインコード（先に処理して * の誤変換を防ぐ）
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // 太字
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
  // 斜体（リスト記号の * と衝突しないよう行頭以外）
  s = s.replace(/(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  // リンク
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
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
    const content = paraLines.map((l) => inlineToHtml(unescapeMd(l))).join("<br>");
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
      const text = inlineToHtml(unescapeMd(hMatch[2].trim()));
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
      out.push(`<p style="margin:0;">${prefix}${inlineToHtml(unescapeMd(ulMatch[2]))}</p>`);
      continue;
    }

    // 順序付きリスト → 同様に <p> で出力
    const olMatch = line.match(/^([ \t]*)(\d+)[.)\\] (.+)$/);
    if (olMatch) {
      closeAll();
      const indent = Math.floor((olMatch[1] || "").replace(/\t/g, "  ").length / 2);
      const prefix = "\u00a0\u00a0\u00a0\u00a0".repeat(indent);
      out.push(`<p style="margin:0;">${prefix}${escapeHtml(olMatch[2])}.\u00a0${inlineToHtml(unescapeMd(olMatch[3]))}</p>`);
      continue;
    }

    // blockquote（ナレッジノートのUserラベル用）
    const bqMatch = line.match(/^> (.+)$/);
    if (bqMatch) {
      closeAll();
      out.push(`<blockquote><p>${inlineToHtml(unescapeMd(bqMatch[1]))}</p></blockquote>`);
      continue;
    }

    // 通常テキスト（段落として蓄積）
    paraLines.push(line);
  }

  closeAll();

  return `<html><body>${out.join("\n")}</body></html>`;
}
