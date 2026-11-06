// @vitest-environment node
/**
 * content script のビルド結果の検証。
 * import 文が残るとブラウザで読み込めず全機能が止まるが、ユニットテストでは検知できないため。
 */
import { expect, it } from "vitest";
import { build } from "vite";
import { resolve } from "node:path";

it("content script は import を含まない1ファイルにビルドされる", async () => {
  const result = await build({
    configFile: resolve(__dirname, "../vite.content.config.ts"),
    logLevel: "silent",
    build: { write: false },
  });
  const outputs = (Array.isArray(result) ? result[0] : result as { output: { type: string; code?: string; fileName: string }[] }).output;
  const chunks = outputs.filter((o) => o.type === "chunk");

  expect(chunks.map((c) => c.fileName)).toEqual(["content/contentScript.js"]);
  expect(chunks[0].code).not.toMatch(/^\s*import[\s{"']/m);
  expect(chunks[0].code).not.toMatch(/\bimport\(/);
});
