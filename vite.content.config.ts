import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * content script 専用のビルド。
 * content script では import 文を実行できないため、popup と共有するモジュールも含めて
 * 1ファイルの IIFE にまとめる（vite.config.ts と分けないと共有チャンクに分割される）。
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/content/contentScript.ts"),
      output: {
        format: "iife",
        entryFileNames: "content/contentScript.js",
      },
    },
  },
});
