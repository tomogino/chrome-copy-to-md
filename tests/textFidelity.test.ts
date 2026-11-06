/**
 * 文字の連結・変化を防ぐ仕様テスト（Phase 2B）。
 * characterization test と異なり、ここに書かれているのは「正しい期待値」。
 */
import { describe, expect, it } from "vitest";
import type { Conversation } from "../src/types/conversation";
import { extractFromHtml, runSelectionPipeline, selectRange } from "./helpers";
import { extractSelection } from "../src/content/extractConversation";
import { formatConversationLog } from "../src/formatter/formatConversationLog";
import { formatKnowledgeNote } from "../src/formatter/formatKnowledgeNote";
import { markdownToHtml } from "../src/formatter/markdownToHtml";

function body(html: string): string {
  return html.replace(/^<html><body>|<\/body><\/html>$/g, "");
}

function convert(html: string) {
  const { markdown, clipboardHtml } = runSelectionPipeline(extractFromHtml(html));
  return { markdown, html: body(clipboardHtml) };
}

const KATEX_INLINE =
  '<span class="katex"><span class="katex-mathml"><math><semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow>' +
  '<annotation encoding="application/x-tex">x^2</annotation></semantics></math></span>' +
  '<span class="katex-html" aria-hidden="true"><span class="mord">x</span><span class="mord">2</span></span></span>';

describe("文字がくっつかない", () => {
  it("段落は結合せず、別々の段落にする", () => {
    const { markdown, html } = convert("<p>First sentence.</p><p>Second sentence.</p>");
    expect(markdown).toBe("First sentence.\n\nSecond sentence.");
    expect(html).toBe("<p>First sentence.</p>\n<p>Second sentence.</p>");
  });

  it("段落内の <br> は改行として残す", () => {
    const { markdown, html } = convert("<p>行1<br>行2<br>Line3</p>");
    expect(markdown).toBe("行1\n行2\nLine3");
    expect(html).toBe("<p>行1<br>行2<br>Line3</p>");
  });

  it("引用内の段落も結合しない", () => {
    const { html } = convert("<blockquote><p>引用1</p><p>引用2</p></blockquote><p>本文</p>");
    expect(html).toBe("<p>引用1</p>\n<p>引用2</p>\n<p>本文</p>");
  });

  it("インライン要素の間のスペースを残す", () => {
    const { markdown, html } = convert(
      '<p>Run <code>npm install</code> <strong>first</strong>, then <a href="https://x.com">docs</a> <em>here</em>.</p>'
    );
    expect(markdown).toBe("Run `npm install` **first**, then [docs](https://x.com) *here*.");
    expect(html).toBe(
      '<p>Run <code>npm install</code> <strong>first</strong>, then <a href="https://x.com">docs</a> <em>here</em>.</p>'
    );
  });

  it("ブロック要素間の整形用空白は残さない", () => {
    const { markdown } = convert("<div>\n  <p>a</p>\n  <p>b</p>\n</div>");
    expect(markdown).toBe("a\n\nb");
  });

  it("強調内の前後の空白は記号の外に出す", () => {
    const { markdown, html } = convert("<p>a<strong> b </strong>c</p>");
    expect(markdown).toBe("a **b** c");
    expect(html).toBe("<p>a <strong>b</strong> c</p>");
  });

  it("Knowledge Note: User 発言・回答・次の回答をそれぞれ別段落にする", () => {
    const conversation: Conversation = {
      exportedAt: "",
      messages: [
        { role: "user", index: 1, text: "質問1行目\n質問2行目\n\n質問の続き" },
        { role: "assistant", index: 1, text: "", html: "<p>回答です。</p>" },
        { role: "assistant", index: 1, text: "", html: "<p>次の回答です。</p>" },
      ],
    };
    expect(body(markdownToHtml(formatKnowledgeNote(conversation)))).toBe(
      "<p><strong>User:</strong> 質問1行目<br>質問2行目</p>\n<p>質問の続き</p>\n<p>回答です。</p>\n<p>次の回答です。</p>"
    );
  });
});

describe("文字が変わらない", () => {
  it("数式は TeX ソースを1回だけ出力する", () => {
    expect(convert(`<p>式 ${KATEX_INLINE} です</p>`).html).toBe("<p>式 $x^2$ です</p>");
  });

  it("ディスプレイ数式は独立した段落にし、中身を解釈しない", () => {
    const display = KATEX_INLINE.replace("x^2", String.raw`\frac{a}{b} = c * d * e`);
    const { markdown, html } = convert(`<p>次式:</p><span class="katex-display">${display}</span><p>以上</p>`);
    expect(markdown).toBe(String.raw`次式:` + "\n\n" + String.raw`$$\frac{a}{b} = c * d * e$$` + "\n\n以上");
    expect(html).toBe(String.raw`<p>次式:</p>` + "\n" + String.raw`<p>$$\frac{a}{b} = c * d * e$$</p>` + "\n<p>以上</p>");
  });

  it("本文のバックスラッシュを残す", () => {
    const { html } = convert(String.raw`<p>C:\Users\.config と a\.b と 1\-2 と \&lt;x&gt;</p>`);
    expect(html).toBe(String.raw`<p>C:\Users\.config と a\.b と 1\-2 と \&lt;x&gt;</p>`);
  });

  it("Markdown 記号に見える本文を記法として解釈しない", () => {
    const { html } = convert(
      "<p>1. 段落</p><p># 見出しではない</p><p>- 注意</p><p>&gt; 引用ではない</p>" +
        "<p>| 表ではない |</p><p>---</p><p>a*b*c と [x](y) と $5 と $10</p>"
    );
    expect(html).toBe(
      [
        "<p>1. 段落</p>",
        "<p># 見出しではない</p>",
        "<p>- 注意</p>",
        "<p>&gt; 引用ではない</p>",
        "<p>| 表ではない |</p>",
        "<p>---</p>",
        "<p>a*b*c と [x](y) と $5 と $10</p>",
      ].join("\n")
    );
  });

  it("見出し・リスト項目の先頭の番号はエスケープしない（text/plain を汚さない）", () => {
    expect(convert("<h3>1. はじめに</h3><ol><li>手順 - 1</li></ol>").markdown).toBe("#### 1. はじめに\n\n1. 手順 - 1");
  });

  it("インラインコードの中身はそのまま出力する", () => {
    const { markdown, html } = convert("<p><code>a * b * c</code> と <code>x`y</code> と <code>$HOME</code></p>");
    expect(markdown).toBe("`a * b * c` と ``x`y`` と `$HOME`");
    expect(html).toBe("<p><code>a * b * c</code> と <code>x`y</code> と <code>$HOME</code></p>");
  });

  it("太字・斜体の入れ子を正しく出力する", () => {
    const { html } = convert(
      "<p><strong><em>重要</em></strong> と <strong>a <em>b</em></strong> と <em>c <strong>d</strong></em></p>"
    );
    expect(html).toBe(
      "<p><strong><em>重要</em></strong> と <strong>a <em>b</em></strong> と <em>c <strong>d</strong></em></p>"
    );
  });

  it("表は <table> として出力し、セル内の書式と | を保つ", () => {
    const { markdown, html } = convert(
      "<table><thead><tr><th>項目</th><th>説明</th></tr></thead><tbody><tr><td><strong>A</strong></td><td>x | y</td></tr></tbody></table>"
    );
    expect(markdown).toBe("| 項目 | 説明 |\n| --- | --- |\n| **A** | x \\| y |");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const cells = Array.from(doc.querySelectorAll("th, td")).map((c) => c.innerHTML);
    expect(cells).toEqual(["項目", "説明", "<strong>A</strong>", "x | y"]);
  });

  it("<tag> のエスケープは後続のバッククォートの有無に左右されない", () => {
    const { markdown, html } = convert("<p>&lt;div&gt; タグ</p><p>後で <code>&lt;x&gt;</code></p>");
    expect(markdown).toBe("\\<div\\> タグ\n\n後で `<x>`");
    expect(html).toBe("<p>&lt;div&gt; タグ</p>\n<p>後で <code>&lt;x&gt;</code></p>");
  });

  it("URL に括弧や記号を含むリンク", () => {
    const { html } = convert(
      '<p><a href="https://ja.wikipedia.org/wiki/A_(B)">A (B)</a> と <a href="https://x.com/a)b">c</a> と <a href="https://x.com/?q=a*b&amp;r=1">q</a></p>'
    );
    expect(html).toBe(
      '<p><a href="https://ja.wikipedia.org/wiki/A_(B)">A (B)</a> と <a href="https://x.com/a%29b">c</a> と <a href="https://x.com/?q=a*b&amp;r=1">q</a></p>'
    );
  });

  it("見出しレベルを h4 / h5 で区別する", () => {
    expect(convert("<h3>h3</h3><h4>h4</h4><h5>h5</h5>").html).toBe("<h4>h3</h4>\n<h5>h4</h5>\n<h6>h5</h6>");
  });

  it("Conversation Log: User 発言の記号を記法として解釈しない", () => {
    const conversation: Conversation = {
      exportedAt: "",
      messages: [{ role: "user", index: 1, text: "", html: "# 見出しではない\n- 箇条書きではない\n*注*" }],
    };
    expect(body(markdownToHtml(formatConversationLog(conversation)))).toBe(
      "<h2>Conversation Log</h2>\n<h3>01｜User</h3>\n<p># 見出しではない<br>- 箇条書きではない<br>*注*</p>"
    );
  });
});

describe("コードブロック", () => {
  const LABEL = '<div class="flex items-center"><div>プレーンテキスト</div><div><button aria-label="コピーする">コピーする</button></div></div>';
  const LINES = ["Text/Primary", "Text/Secondary", "Text/Tertiary", "Text/Inverse"];
  const EXPECTED_MD = "```\nText/Primary\nText/Secondary\nText/Tertiary\nText/Inverse\n```\n\nなどに分けます。";
  const EXPECTED_HTML =
    "<pre><code>Text/Primary\nText/Secondary\nText/Tertiary\nText/Inverse</code></pre>\n<p>などに分けます。</p>";
  const AFTER = "<p>などに分けます。</p>";

  const structures: [string, string][] = [
    ["<pre> なし・span と改行", `<div>${LABEL}<div class="cm-content">${LINES.map((l) => `<span>${l}</span>`).join("\n")}</div></div>`],
    ["<pre> なし・span と <br>", `<div>${LABEL}<div id="code-block-viewer" class="cm-editor"><div class="cm-scroller"><div class="cm-content">${LINES.map((l) => `<span>${l}</span>`).join("<br>")}</div></div></div></div>`],
    ["<pre> あり・<code> なし・cm-line", `<pre><div>${LABEL}<div class="cm-editor"><div class="cm-content">${LINES.map((l) => `<div class="cm-line">${l}</div>`).join("")}</div></div></div></pre>`],
    ["<pre> あり・<code> 内を div で改行", `<pre><div>${LABEL}<code>${LINES.map((l) => `<div>${l}</div>`).join("")}</code></div></pre>`],
  ];

  for (const [name, html] of structures) {
    it(`言語ラベルを出さず、改行を維持する: ${name}`, () => {
      const result = convert(html + AFTER);
      expect(result.markdown).toBe(EXPECTED_MD);
      expect(result.html).toBe(EXPECTED_HTML);
    });
  }

  it("行番号はコードに含めない", () => {
    const html = `<div class="cm-editor"><div class="cm-gutters">123</div><div class="cm-content"><div class="cm-line">a</div><div class="cm-line">b</div></div></div>`;
    expect(convert(html).markdown).toBe("```\na\nb\n```");
  });

  it("コードブロックの直前の本文段落はラベル扱いしない", () => {
    const html = `<p>短い説明</p><div class="cm-content"><span>a</span></div>`;
    expect(convert(html).markdown).toBe("短い説明\n\n```\na\n```");
  });

  it("<pre> の外の複数行 <code> はコードブロックにする", () => {
    expect(convert("<code>a\nb</code>").markdown).toBe("```\na\nb\n```");
  });

  it("コードの内側だけを選択してもコードブロックのまま改行を維持する", () => {
    document.body.innerHTML = '<div class="cm-content"><span id="a">x</span>\n<span>y</span>\n<span id="z">z</span></div>';
    const range = document.createRange();
    range.setStartBefore(document.getElementById("a")!);
    range.setEndAfter(document.getElementById("z")!);
    selectRange(range);
    expect(runSelectionPipeline(extractSelection()).markdown).toBe("```\nx\ny\nz\n```");
  });
});
