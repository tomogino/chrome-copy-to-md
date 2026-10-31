/**
 * Characterization test: Copy Selection の現行出力を記録する。
 *
 * tests/fixtures/selection/*.html を全体選択 → extractSelection → formatSelection → markdownToHtml
 * の順に通し、各段階の結果を tests/__snapshots__/selection/ にファイルとして保存する。
 *
 * - ここに記録されているのは「現行の動作」であり「正しい期待値」ではない。
 * - 修正フェーズで出力が変わったら `npm run test:update` で更新し、git diff で前後比較する。
 * - 新しいケースは fixtures/selection に .html を追加するだけでよい。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractFromHtml, runSelectionPipeline } from "./helpers";
import { formatSelection } from "../src/formatter/formatSelection";

const FIXTURE_DIR = join(__dirname, "fixtures/selection");
const SNAPSHOT_DIR = join(__dirname, "__snapshots__/selection");

const fixtures = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".html")).sort();

describe("Copy Selection characterization (fixtures)", () => {
  for (const file of fixtures) {
    const name = file.replace(/\.html$/, "");

    it(name, async () => {
      const source = readFileSync(join(FIXTURE_DIR, file), "utf8");
      const extractedHtml = extractFromHtml(source);
      const { markdown, clipboardHtml } = runSelectionPipeline(extractedHtml);

      await expect(extractedHtml).toMatchFileSnapshot(join(SNAPSHOT_DIR, `${name}.1-extracted.html`));
      await expect(markdown).toMatchFileSnapshot(join(SNAPSHOT_DIR, `${name}.2-markdown.md`));
      await expect(clipboardHtml).toMatchFileSnapshot(join(SNAPSHOT_DIR, `${name}.3-clipboard.html`));
    });
  }
});

describe("formatSelection tracer", () => {
  it("tracer の有無で出力が変わらない（デバッグ機能が本番出力に影響しない）", () => {
    for (const file of fixtures) {
      const extractedHtml = extractFromHtml(readFileSync(join(FIXTURE_DIR, file), "utf8"));
      const stages: string[] = [];
      expect(formatSelection(extractedHtml, (stage) => stages.push(stage))).toBe(formatSelection(extractedHtml));
      expect(stages).toHaveLength(8);
    }
  });
});
