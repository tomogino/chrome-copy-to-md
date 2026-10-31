import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // htmlToMarkdown / extractSelection は DOM API を使うため jsdom で実行する
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
