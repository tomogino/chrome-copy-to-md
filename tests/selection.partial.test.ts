/**
 * Characterization test: 選択範囲が要素の途中で始まる/終わるケースの現行出力を記録する。
 * インラインスナップショットは現行動作の記録であり、正しい期待値ではない。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { extractSelection } from "../src/content/extractConversation";
import { findTextNode, runSelectionPipeline, selectRange } from "./helpers";

const DOC = `
<div class="markdown prose">
<h2>見出しです</h2>
<p>前半の文章です。<strong>太字部分</strong>後半の文章です。</p>
<p>二つ目の段落です。</p>
<ul>
<li>項目一</li>
<li>項目二</li>
</ul>
<pre><div>python</div><div><button>Copy code</button></div><div><code class="language-python">print("a")
print("b")
</code></div></pre>
<p>最後の段落です。</p>
</div>`;

function select(startText: string, startOffset: number, endText: string, endOffset: number) {
  const root = document.body;
  const range = document.createRange();
  range.setStart(findTextNode(root, startText), startOffset);
  range.setEnd(findTextNode(root, endText), endOffset);
  selectRange(range);
  const extractedHtml = extractSelection();
  return { extractedHtml, ...runSelectionPipeline(extractedHtml) };
}

beforeEach(() => {
  document.body.innerHTML = DOC;
});

describe("Copy Selection characterization (partial ranges)", () => {
  it("段落の途中で始まる", () => {
    // 「文章です。」から二つ目の段落末尾まで
    expect(select("前半の文章です。", 3, "二つ目の段落です。", 9)).toMatchInlineSnapshot(`
      {
        "clipboardHtml": "<html><body><p>文章です。<strong>太字部分</strong>後半の文章です。</p>
      <p>二つ目の段落です。</p></body></html>",
        "extractedHtml": "<p>文章です。<strong>太字部分</strong>後半の文章です。</p>
      <p>二つ目の段落です。</p>",
        "markdown": "文章です。**太字部分**後半の文章です。

      二つ目の段落です。",
      }
    `);
  });

  it("段落の途中で終わる", () => {
    // 見出しから「後半の」まで
    expect(select("見出しです", 0, "後半の文章です。", 3)).toMatchInlineSnapshot(`
      {
        "clipboardHtml": "<html><body><h3>見出しです</h3>
      <p>前半の文章です。<strong>太字部分</strong>後半の</p></body></html>",
        "extractedHtml": "<h2>見出しです</h2>
      <p>前半の文章です。<strong>太字部分</strong>後半の</p>",
        "markdown": "### 見出しです

      前半の文章です。**太字部分**後半の",
      }
    `);
  });

  it("単一テキストノード内の選択", () => {
    expect(select("前半の文章です。", 0, "前半の文章です。", 4)).toMatchInlineSnapshot(`
      {
        "clipboardHtml": "<html><body><p>前半の文</p></body></html>",
        "extractedHtml": "前半の文",
        "markdown": "前半の文",
      }
    `);
  });

  it("リスト項目の途中で始まる", () => {
    expect(select("項目一", 1, "最後の段落です。", 4)).toMatchInlineSnapshot(`
      {
        "clipboardHtml": "<html><body><p style="margin:0;">• 目一</p>
      <p style="margin:0;">• 項目二</p>
      <pre><code class="language-python">print("a")
      print("b")</code></pre>
      <p>最後の段</p></body></html>",
        "extractedHtml": "<ul><li>目一</li>
      <li>項目二</li>
      </ul>
      <pre><div>python</div><div></div><div><code class="language-python">print("a")
      print("b")
      </code></div></pre>
      <p>最後の段</p>",
        "markdown": "* 目一
      * 項目二

      \`\`\`python
      print("a")
      print("b")
      \`\`\`

      最後の段",
      }
    `);
  });

  it("コードブロックの途中で始まる", () => {
    expect(select('print("a")', 3, "最後の段落です。", 8)).toMatchInlineSnapshot(`
      {
        "clipboardHtml": "<html><body><pre><code class="language-python">nt("a")
      print("b")</code></pre>
      <p>最後の段落です。</p></body></html>",
        "extractedHtml": "<pre><div><code class="language-python">nt("a")
      print("b")
      </code></div></pre>
      <p>最後の段落です。</p>",
        "markdown": "\`\`\`python
      nt("a")
      print("b")
      \`\`\`

      最後の段落です。",
      }
    `);
  });

  it("未選択ならエラー", () => {
    window.getSelection()!.removeAllRanges();
    expect(() => extractSelection()).toThrowErrorMatchingInlineSnapshot(`[Error: テキストが選択されていません。ChatGPTページでコピーしたい範囲を選択してから実行してください。]`);
  });
});
