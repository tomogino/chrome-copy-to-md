/**
 * Characterization test: fixture で観測された問題を、変換段階ごとに切り分けて記録する。
 * いずれも現行動作の記録であり、修正フェーズで期待値を変更する前提。
 */
import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "../src/formatter/htmlToMarkdown";
import { escapeForGoogleDocs, normalizeHeadings } from "../src/formatter/normalizeMarkdown";
import { markdownToHtml } from "../src/formatter/markdownToHtml";

describe("htmlToMarkdown", () => {
  it("入れ子リストのインデント（2段/3段）", () => {
    const md = htmlToMarkdown("<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>");
    expect(JSON.stringify(md)).toMatchInlineSnapshot(`""- a\\n - b\\n - c""`);
  });
});

describe("normalizeHeadings", () => {
  it("h4/h5 の衝突", () => {
    expect(normalizeHeadings("#### h4\n\n##### h5\n\n###### h6")).toMatchInlineSnapshot(`
      "##### h4

      ##### h5

      ###### h6"
    `);
  });
});

describe("escapeForGoogleDocs", () => {
  it("後続行にバッククォートがあるかで <tag> のエスケープ結果が変わる", () => {
    expect({
      noBacktickAfter: escapeForGoogleDocs("a <div> b"),
      backtickInLaterLine: escapeForGoogleDocs("a <div> b\n\n`code`"),
    }).toMatchInlineSnapshot(`
      {
        "backtickInLaterLine": "a <div> b

      \`code\`",
        "noBacktickAfter": "a \\<div\\> b",
      }
    `);
  });
});

describe("markdownToHtml", () => {
  it("インラインコード内の * が <em> に変換される", () => {
    expect(markdownToHtml("`a * b * c`")).toMatchInlineSnapshot(`"<html><body><p><code>a <em> b </em> c</code></p></body></html>"`);
  });

  it("***太字斜体*** のタグ入れ子", () => {
    expect(markdownToHtml("***x***")).toMatchInlineSnapshot(`"<html><body><p><strong><em>x</strong></em></p></body></html>"`);
  });

  it("入れ子リストのインデント幅（2スペース単位）", () => {
    expect(markdownToHtml("* a\n  * b\n    * c\n * d")).toMatchInlineSnapshot(`
      "<html><body><p style="margin:0;">• a</p>
      <p style="margin:0;">    • b</p>
      <p style="margin:0;">        • c</p>
      <p style="margin:0;">• d</p></body></html>"
    `);
  });
});
