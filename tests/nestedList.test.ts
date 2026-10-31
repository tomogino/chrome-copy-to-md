/**
 * 入れ子リスト変換の仕様テスト（Phase 2A）。
 * characterization test と異なり、ここに書かれているのは「正しい期待値」。
 */
import { describe, expect, it } from "vitest";
import { extractSelection } from "../src/content/extractConversation";
import { extractFromHtml, findTextNode, runSelectionPipeline, selectRange } from "./helpers";
import { NON_LIST_INDENT, trimKeepingListIndent } from "../src/formatter/listSyntax";
import { formatConversationLog } from "../src/formatter/formatConversationLog";
import { formatKnowledgeNote } from "../src/formatter/formatKnowledgeNote";

const NBSP4 = " ".repeat(4);

/**
 * Clipboard HTML をブロック単位の読みやすい文字列に変換する。
 * - リスト段落: "  ".repeat(depth) + "• text" / "1. text"（depth は NBSP×4 の数）
 * - 通常段落: "¶ text"
 * - その他: "<tag> text"
 */
function clipboardBlocks(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.children).map((el) => {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent ?? "";
    if (tag !== "p") return `<${tag}> ${text}`;
    const m = text.match(/^((?: {4})*)(• |\d+\. )/);
    if (!m) return `¶ ${text}`;
    const depth = m[1].length / 4;
    return `${"  ".repeat(depth)}${m[2].replace(" ", " ")}${text.slice(m[0].length)}`;
  });
}

/** Google Docs 向けHTMLの既存方針を検証する */
function expectDocsPolicy(html: string): void {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // <ul>/<ol>/<li> は使わない
  expect(doc.querySelector("ul, ol, li")).toBeNull();
  for (const p of Array.from(doc.querySelectorAll("p"))) {
    const text = p.textContent ?? "";
    const isListItem = /^(?: {4})*(?:•|\d+\.) /.test(text);
    if (isListItem) {
      // リスト段落は margin:0 の <p>
      expect(p.getAttribute("style")).toBe("margin:0;");
    } else {
      // 通常段落にはインデントを持ち込まない
      expect(text.startsWith(" ")).toBe(false);
      expect(p.hasAttribute("style")).toBe(false);
    }
  }
}

function convert(html: string) {
  const extracted = extractFromHtml(html);
  const { markdown, clipboardHtml } = runSelectionPipeline(extracted);
  expectDocsPolicy(clipboardHtml);
  return { markdown, blocks: clipboardBlocks(clipboardHtml), clipboardHtml };
}

// 依頼仕様に記載された入力（整形用の空白・改行を含む）
const SPEC_HTML = `
<ul>
  <li>main：リリース済み
    <ul>
      <li>目的：常にユーザーに出せる状態</li>
      <li>特徴：
        <ul>
          <li>緊急修正以外は直接変更しない</li>
        </ul>
      </li>
    </ul>
  </li>
  <li>development：次リリース</li>
</ul>`;

describe("入れ子リスト", () => {
  it("仕様例（3階層・整形空白あり）", () => {
    const { markdown, blocks, clipboardHtml } = convert(SPEC_HTML);
    expect(markdown).toBe(
      [
        "* main：リリース済み",
        "  * 目的：常にユーザーに出せる状態",
        "  * 特徴：",
        "    * 緊急修正以外は直接変更しない",
        "* development：次リリース",
      ].join("\n")
    );
    expect(blocks).toEqual([
      "• main：リリース済み",
      "  • 目的：常にユーザーに出せる状態",
      "  • 特徴：",
      "    • 緊急修正以外は直接変更しない",
      "• development：次リリース",
    ]);
    // 字下げは NBSP×4 / 階層（既存方式）
    expect(clipboardHtml).toContain(`<p style="margin:0;">${NBSP4}${NBSP4}• 緊急修正以外は直接変更しない</p>`);
  });

  it("1. 1階層", () => {
    const { markdown, blocks } = convert("<ul><li>A</li><li>B</li></ul>");
    expect(markdown).toBe("* A\n* B");
    expect(blocks).toEqual(["• A", "• B"]);
  });

  it("2. 2階層", () => {
    const { markdown, blocks } = convert("<ul><li>A<ul><li>A-1</li><li>A-2</li></ul></li><li>B</li></ul>");
    expect(markdown).toBe("* A\n  * A-1\n  * A-2\n* B");
    expect(blocks).toEqual(["• A", "  • A-1", "  • A-2", "• B"]);
  });

  it("3. 4階層", () => {
    const { markdown, blocks } = convert(
      "<ul><li>L0<ul><li>L1<ul><li>L2<ul><li>L3</li></ul></li></ul></li></ul></li><li>L0b</li></ul>"
    );
    expect(markdown).toBe("* L0\n  * L1\n    * L2\n      * L3\n* L0b");
    expect(blocks).toEqual(["• L0", "  • L1", "    • L2", "      • L3", "• L0b"]);
  });

  it("4. 親項目の本文（<p>包み）と子リストの共存", () => {
    // ChatGPT の loose list は <li><p>本文</p><ul>…</ul></li> になることがある（実DOM未確認）
    const { markdown, blocks } = convert(
      "<ul><li><p>親の<strong>本文</strong></p><ul><li><p>子1</p></li><li><p>子2</p></li></ul></li><li><p>次の親</p></li></ul>"
    );
    expect(markdown).toBe("* 親の**本文**\n  * 子1\n  * 子2\n* 次の親");
    expect(blocks).toEqual(["• 親の本文", "  • 子1", "  • 子2", "• 次の親"]);
  });

  it("5. 入れ子リストの後に通常段落", () => {
    const { markdown, blocks } = convert("<p>前の段落</p><ul><li>A<ul><li>A-1</li></ul></li></ul><p>後の段落</p>");
    expect(markdown).toBe("前の段落\n\n* A\n  * A-1\n\n後の段落");
    expect(blocks).toEqual(["¶ 前の段落", "• A", "  • A-1", "¶ 後の段落"]);
  });

  it("6. 番号付きリスト（入れ子）", () => {
    const { markdown, blocks } = convert("<ol><li>手順1<ol><li>詳細a</li><li>詳細b</li></ol></li><li>手順2</li></ol>");
    expect(markdown).toBe("1. 手順1\n  1. 詳細a\n  2. 詳細b\n2. 手順2");
    expect(blocks).toEqual(["1. 手順1", "  1. 詳細a", "  2. 詳細b", "2. 手順2"]);
  });

  it("7. 番号付きと箇条書きの混在", () => {
    const { markdown, blocks } = convert(
      "<ol><li><p>手順1</p><ul><li>注意A<ol><li>補足</li></ol></li></ul></li><li><p>手順2</p></li></ol>"
    );
    expect(markdown).toBe("1. 手順1\n  * 注意A\n    1. 補足\n2. 手順2");
    expect(blocks).toEqual(["1. 手順1", "  • 注意A", "    1. 補足", "2. 手順2"]);
  });

  it("8. リスト内の太字・リンク・インラインコード", () => {
    const { markdown, blocks, clipboardHtml } = convert(
      '<ul><li><strong>太字</strong> と <a href="https://example.com">リンク</a><ul><li><code>npm test</code> を実行</li></ul></li></ul>'
    );
    expect(markdown).toBe("* **太字** と [リンク](https://example.com)\n  * `npm test` を実行");
    expect(blocks).toEqual(["• 太字 と リンク", "  • npm test を実行"]);
    expect(clipboardHtml).toContain('<strong>太字</strong> と <a href="https://example.com">リンク</a>');
    expect(clipboardHtml).toContain(`${NBSP4}• <code>npm test</code> を実行`);
  });

  describe("9. リストの一部だけを選択", () => {
    function selectAndConvert(startText: string, startOffset: number, endText: string, endOffset: number) {
      document.body.innerHTML = SPEC_HTML;
      const range = document.createRange();
      range.setStart(findTextNode(document.body, startText), startOffset);
      range.setEnd(findTextNode(document.body, endText), endOffset);
      selectRange(range);
      const { markdown, clipboardHtml } = runSelectionPipeline(extractSelection());
      expectDocsPolicy(clipboardHtml);
      return { markdown, blocks: clipboardBlocks(clipboardHtml) };
    }

    it("子項目の途中から親の次の項目まで（元の階層を維持）", () => {
      const { markdown, blocks } = selectAndConvert("目的：", 1, "development", 11);
      expect(markdown).toBe(
        ["  * 的：常にユーザーに出せる状態", "  * 特徴：", "    * 緊急修正以外は直接変更しない", "* development"].join("\n")
      );
      expect(blocks).toEqual(["  • 的：常にユーザーに出せる状態", "  • 特徴：", "    • 緊急修正以外は直接変更しない", "• development"]);
    });

    it("同じ階層の子項目だけ", () => {
      const { markdown, blocks } = selectAndConvert("目的：", 0, "特徴：", 3);
      expect(markdown).toBe("* 目的：常にユーザーに出せる状態\n* 特徴：");
      expect(blocks).toEqual(["• 目的：常にユーザーに出せる状態", "• 特徴："]);
    });
  });

  describe("10. コードブロック内のリスト風文字列は変更しない", () => {
    const CODE = "- a\n  - b\n    - c\n\n1. x\n   2. y";

    it("トップレベルのコードブロック", () => {
      const { markdown, clipboardHtml } = convert(
        `<ul><li>A<ul><li>A-1</li></ul></li></ul><pre><code class="language-yaml">${CODE}</code></pre>`
      );
      expect(markdown).toBe(`* A\n  * A-1\n\n\`\`\`yaml\n${CODE}\n\`\`\``);
      expect(clipboardHtml).toContain(`<pre><code class="language-yaml">${CODE}</code></pre>`);
    });

    it("リスト項目内のコードブロック", () => {
      const { markdown } = convert(`<ul><li><p>設定例：</p><pre><code>${CODE}</code></pre></li></ul>`);
      expect(markdown).toContain(`\`\`\`\n${CODE}\n\`\`\``);
    });
  });
});

describe("listSyntax（正規表現の安全性）", () => {
  it("NON_LIST_INDENT: リスト行のインデントは保持し、それ以外の行頭空白は完全に除去する", () => {
    const input = [
      "  * a", // 2スペースの箇条書き → 保持
      "    - b", // 4スペース → 保持
      "\t1. c", // タブ + 番号 → 保持
      "  2) d", // "2)" 形式 → 保持
      "  **太字**の段落", // * で始まるがマーカーではない → 除去
      "  2024年の段落", // 数字で始まるがマーカーではない → 除去
      "   ", // 空白のみの行 → 除去
      "通常の段落",
    ].join("\n");
    expect(input.replace(NON_LIST_INDENT, "").split("\n")).toEqual([
      "  * a",
      "    - b",
      "\t1. c",
      "  2) d",
      "**太字**の段落",
      "2024年の段落",
      "",
      "通常の段落",
    ]);
  });

  it("trimKeepingListIndent: 先頭がインデント付きリスト行のときだけ字下げを残す", () => {
    expect(trimKeepingListIndent("\n\n  * 子\n* 親\n\n")).toBe("  * 子\n* 親");
    // それ以外は trim() と同じ（全角スペース等も従来通り除去）
    expect(trimKeepingListIndent("\n　段落\n")).toBe("段落");
    expect(trimKeepingListIndent("  段落  ")).toBe("段落");
  });
});

describe("他モードへの波及（共通処理の修正による改善）", () => {
  it("Conversation Log でも入れ子リストが維持される", () => {
    const md = formatConversationLog({
      exportedAt: "2026-01-01T00:00:00.000Z",
      messages: [{ role: "assistant", index: 1, text: "", html: "<ul><li>A<ul><li>A-1<ul><li>A-1-a</li></ul></li></ul></li></ul>" }],
    });
    expect(md).toContain("* A\n  * A-1\n    * A-1-a");
  });

  it("Knowledge Note でも入れ子リストが維持される", () => {
    const md = formatKnowledgeNote({
      exportedAt: "2026-01-01T00:00:00.000Z",
      messages: [{ role: "assistant", index: 1, text: "", html: "<ol><li>A<ol><li>A-1</li></ol></li></ol>" }],
    });
    expect(md).toBe("1. A\n  1. A-1");
  });
});
