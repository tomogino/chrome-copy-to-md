/**
 * ChatGPT のHTML出力をMarkdownテキストに変換する。
 * DOM APIを使うため content script 内でのみ動作する。
 */
import { protectCodeBlocks, restoreCodeBlocks } from "./protectCodeBlocks";

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

function nodeToMarkdown(node: Node, listLevel = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    // 空白のみのテキストノード（HTMLの整形インデント）は除去する
    // これがあると行頭にスペースが入り Google Docs がblockquoteとして解釈する
    if (/^\s+$/.test(text)) return "";
    return text;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes);

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
    case "b": {
      const inner = children.map((c) => nodeToMarkdown(c)).join("");
      return `**${inner}**`;
    }

    case "em":
    case "i": {
      const inner = children.map((c) => nodeToMarkdown(c)).join("");
      return `*${inner}*`;
    }

    case "code": {
      if (el.parentElement?.tagName.toLowerCase() === "pre") {
        return el.textContent || "";
      }
      return `\`${el.textContent || ""}\``;
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
        .map((li) => {
          const inner = Array.from(li.childNodes)
            .map((c) => nodeToMarkdown(c, listLevel + 1))
            .join("")
            .trimEnd()
            // li内テキストと入れ子リストの間にHTMLの整形空白（\n + スペース）が入ると
            // Markdown上で空行になるため除去する
            .replace(/\n[ \t]*\n(\s*[*\-\d])/g, "\n$1");
          return `${getIndent(listLevel)}- ${inner}`;
        })
        .join("\n");
      // 前後の文章と分離するため先頭に \n を追加
      return `\n${items}\n\n`;
    }

    case "ol": {
      const items = children
        .filter((c) => (c as Element).tagName?.toLowerCase() === "li")
        .map((li, i) => {
          const inner = Array.from(li.childNodes)
            .map((c) => nodeToMarkdown(c, listLevel + 1))
            .join("")
            .trimEnd()
            .replace(/\n[ \t]*\n(\s*[*\-\d])/g, "\n$1");
          return `${getIndent(listLevel)}${i + 1}. ${inner}`;
        })
        .join("\n");
      return `\n${items}\n\n`;
    }

    case "li": {
      const inner = children.map((c) => nodeToMarkdown(c, listLevel)).join("").trimEnd();
      return `${getIndent(listLevel)}- ${inner}\n`;
    }

    case "a": {
      const href = el.getAttribute("href") || "";
      const text = children.map((c) => nodeToMarkdown(c)).join("");
      return href ? `[${text}](${href})` : text;
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

function tableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";

  const lines: string[] = [];

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll("td, th")).map((cell) => {
      return (cell.textContent || "").trim().replace(/\|/g, "\\|");
    });
    lines.push(`| ${cells.join(" | ")} |`);

    if (rowIndex === 0) {
      lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
    }
  });

  return lines.join("\n") + "\n\n";
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
    // ネストリスト（"  * " / "  - "）以外の行頭スペース・タブを除去
    .replace(/^[ \t]+(?![*\-\d])/gm, "")
    // 3連続以上の改行を2つに
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return restoreCodeBlocks(normalized, store);
}
