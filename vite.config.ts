import { defineConfig } from "vite";
import { resolve } from "path";

// content script は vite.content.config.ts で別にビルドする
export default defineConfig({
  // srcをrootにすることでpopup.htmlの出力パスが dist/popup/popup.html になる
  root: "src",
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
      },
      output: {
        entryFileNames: "[name]/[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: (asset) => {
          if (asset.name?.endsWith(".css")) {
            return "popup/popup.css";
          }
          return "[name][extname]";
        },
      },
    },
  },
});
