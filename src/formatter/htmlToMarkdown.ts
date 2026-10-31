/**
 * ChatGPT のHTML出力をMarkdownテキストに変換する。
 * DOM APIを使うため DOM のある環境（popup）で動作する。
 */
import { protectCodeBlocks, restoreCodeBlocks } from "./protectCodeBlocks";
import { LIST_MARKER, NON_LIST_INDENT, startsWithIndentedListLine, trimKeepingListIndent } from "./listSyntax";
import { codeSpan, encodeLinkDestination, escapeMarkdownText } from "./inlineSyntax";

function getIndent(level: number): string {
  return "  ".repeat(level);
}

/**
 * <code> 要素内のテキストを改行を保持して抽出する。
 * innerText は detached DOM では動作しないため、子ノードを再帰的に走査する。
 * <br> → \n、テキストノードはそのまま収集、span 等は再帰的に処理する。
 */
function extractCodeText(el: Element): string {
  let result = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toLowerCase();
      if (tag === "br") {
        result += "\n";
      } else {
        result += extractCodeText(node as Element);
      }
    }
  }
  return result;
}

const INLINE_TAGS = new Set([
  "a", "abbr", "b", "cite", "code", "del", "dfn", "em", "i", "img", "ins", "kbd",
  "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var",
]);

function isWhitespaceText(node: Node | null): boolean {
  return node?.nodeType === Node.TEXT_NODE && /^\s*$/.test(node.textContent || "");
}

/** テキストノード、またはインライン要素か */
function isInlineNode(node: Node | null): boolean {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) return true;
  return node.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has((node as Element).tagName.toLowerCase());
}

/** ノードの先頭が Markdown の行頭に来るか（見出し・li・セルの中は記号の後ろなので行頭ではない） */
function startsLine(node: Node): boolean {
  let prev = node.previousSibling;
  while (isWhitespaceText(prev)) prev = prev!.previousSibling;
  if (prev) return !isInlineNode(prev);
  const parent = node.parentElement;
  if (!parent) return true;
  const tag = parent.tagName.toLowerCase();
  if (INLINE_TAGS.has(tag)) return startsLine(parent);
  return !/^(h[1-6]|li|td|th)$/.test(tag);
}

/** KaTeX 要素から TeX ソースを取り出す（表示用・読み上げ用テキストの重複出力を防ぐ） */
function katexSource(el: Element): string | null {
  const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
  return tex ? tex.trim().replace(/\s*\n\s*/g, " ") : null;
}

/**
 * 強調記号で囲む。前後の空白は記号の外に出す（"** a**" は強調として解釈されないため）
 */
function wrapInline(inner: string, marker: string): string {
  const [, lead, core, trail] = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return core ? `${lead}${marker}${core}${marker}${trail}` : inner;
}

function nodeToMarkdown(node: Node, listLevel = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    if (/^\s+$/.test(text)) {
      // 空白のみのテキストノードは、インライン要素同士の間なら単語区切りとして残し、
      // それ以外（HTMLの整形インデント）は除去する。
      // 行頭にスペースが入ると Google Docs がblockquoteとして解釈するため
      return isInlineNode(node.previousSibling) && isInlineNode(node.nextSibling) ? " " : "";
    }
    return escapeMarkdownText(text, startsLine(node));
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes);

  if (el.classList.contains("katex-display") || el.classList.contains("katex")) {
    const tex = katexSource(el);
    if (tex !== null) {
      return el.classList.contains("katex-display") ? `\n$$${tex}$$\n\n` : `$${tex}$`;
    }
  }

  switch (tag) {
    case "p": {
      const inner = children.map((c) => nodeToMarkdown(c, listLevel)).join("");
      const text = inner.trim();
      // ブロック要素として前後に改行を入れる
      return text ? text + "\n\n" : "";
    }

    case "h1":
      return `\n# ${children.map((c) => nodeToMarkdown(c)).join("").trim()}\n\n`;
    case "h2":
      return `\n## ${children.map((c) => nodeToMarkdown(c)).join("").trim()}\n\n`;
    case "h3":
      return `\n### ${children.map((c) => nodeToMarkdown(c)).join("").trim()}\n\n`;
    case "h4":
      return `\n#### ${children.map((c) => nodeToMarkdown(c)).join("").trim()}\n\n`;
    case "h5":
      return `\n##### ${children.map((c) => nodeToMarkdown(c)).join("").trim()}\n\n`;
    case "h6":
      return `\n###### ${children.map((c) => nodeToMarkdown(c)).join("").trim()}\n\n`;

    case "strong":
    case "b":
      return wrapInline(children.map((c) => nodeToMarkdown(c)).join(""), "**");

    case "em":
    case "i":
      return wrapInline(children.map((c) => nodeToMarkdown(c)).join(""), "*");

    case "code": {
      if (el.parentElement?.tagName.toLowerCase() === "pre") {
        return el.textContent || "";
      }
      return codeSpan((el.textContent || "").replace(/\n/g, " "));
    }

    case "pre": {
      const codeEl = el.querySelector("code");
      const langClass = codeEl?.className.match(/language-(\S+)/)?.[1] || "";
      // innerText は detached DOM では動作しないため extractCodeText で収集する
      const rawCode = codeEl ? extractCodeText(codeEl) : (el.textContent || "");
      // ChatGPT の syntax highlight span が行末に \n を持ち span 間のテキストノードも \n を
      // 追加するため、先頭・末尾の余分な \n を除去し、3連以上の内部 \n を \n\n に制限する
      const code = rawCode.replace(/^\n+/, "").replace(/\n+$/, "").replace(/\n{3,}/g, "\n\n");
      // 先頭に \n を追加して前の段落テキストと分離する
      return `\n\`\`\`${langClass}\n${code}\n\`\`\`\n\n`;
    }

    case "ul": {
      const items = children
        .filter((c) => (c as Element).tagName?.toLowerCase() === "li")
        .map((li) => listItemToMarkdown(li as Element, listLevel, "-"))
        .join("\n");
      // 前後の文章と分離するため先頭に \n を追加
      return `\n${items}\n\n`;
    }

    case "ol": {
      const items = children
        .filter((c) => (c as Element).tagName?.toLowerCase() === "li")
        .map((li, i) => listItemToMarkdown(li as Element, listLevel, `${i + 1}.`))
        .join("\n");
      return `\n${items}\n\n`;
    }

    case "li": {
      // 親の ul/ol を含まない選択範囲では li が単独で現れる
      return `${listItemToMarkdown(el, listLevel, "-")}\n`;
    }

    case "a": {
      const href = el.getAttribute("href") || "";
      const text = children.map((c) => nodeToMarkdown(c)).join("");
      return href ? `[${text}](${encodeLinkDestination(href)})` : text;
    }

    case "table":
      return tableToMarkdown(el);

    case "br":
      return "\n";

    case "hr":
      return "\n---\n\n";

    case "blockquote": {
      // ChatGPT は段落を <blockquote> で包むことがある。
      // > プレフィックスを付けずに内容だけ取り出す。
      return children.map((c) => nodeToMarkdown(c, listLevel)).join("");
    }

    case "div":
    case "span":
    case "section":
    case "article":
    default:
      return children.map((c) => nodeToMarkdown(c, listLevel)).join("");
  }
}

const BLANK_LINES_BEFORE_LIST = new RegExp(String.raw`\n\s*\n(?=[ \t]*${LIST_MARKER})`, "g");

/**
 * li 要素を Markdown のリスト項目に変換する（ul / ol / 単独 li 共通）。
 * 子要素は listLevel + 1 で変換するため、入れ子リストは2スペース/階層で字下げされる。
 */
function listItemToMarkdown(li: Element, listLevel: number, marker: string): string {
  const raw = Array.from(li.childNodes)
    .map((c) => nodeToMarkdown(c, listLevel + 1))
    .join("");

  // li 内のコードブロックを保護してから空白を整理する
  const { protected: safe, store } = protectCodeBlocks(raw);
  // 本文と入れ子リストの間の空行（HTMLの整形空白や <p> 由来）を除去する
  const body = safe.trimEnd().replace(BLANK_LINES_BEFORE_LIST, "\n");

  // 子リストの途中から選択した場合など、li 自身の本文がないときは
  // 空の親項目（"- " だけの行）を出さず、子リストを元の階層のまま返す
  if (startsWithIndentedListLine(body)) {
    return restoreCodeBlocks(trimKeepingListIndent(body), store);
  }

  return `${getIndent(listLevel)}${marker} ${restoreCodeBlocks(body.trimStart(), store)}`;
}

function tableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";

  const lines: string[] = [];

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll("td, th")).map((cell) => {
      const inner = Array.from(cell.childNodes).map((c) => nodeToMarkdown(c)).join("");
      // セル内の改行（<p> や <br>）は1行に収め、区切り文字 | をエスケープする
      return inner.trim().replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
    });
    lines.push(`| ${cells.join(" | ")} |`);

    if (rowIndex === 0) {
      lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
    }
  });

  return "\n" + lines.join("\n") + "\n\n";
}

/**
 * HTMLテキストをMarkdownに変換する
 */
export function htmlToMarkdown(html: string): string {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const raw = nodeToMarkdown(wrapper);

  // コードブロックを保護してから空白を正規化
  const { protected: safe, store } = protectCodeBlocks(raw);
  const normalized = safe
    // 行末の余分なスペース・タブを除去（Markdownの強制改行 "  \n" も除去）
    .replace(/[ \t]+$/gm, "")
    // ネストリスト（"  * " / "  - " / "  1. "）以外の行頭スペース・タブを除去
    .replace(NON_LIST_INDENT, "")
    // 3連続以上の改行を2つに
    .replace(/\n{3,}/g, "\n\n");

  return restoreCodeBlocks(trimKeepingListIndent(normalized), store);
}
