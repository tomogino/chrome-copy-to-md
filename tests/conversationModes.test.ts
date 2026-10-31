/**
 * Characterization test: Conversation Log / Knowledge Note の現行出力を記録する（回帰検知用）。
 */
import { describe, expect, it } from "vitest";
import type { Conversation } from "../src/types/conversation";
import { formatConversationLog } from "../src/formatter/formatConversationLog";
import { formatKnowledgeNote } from "../src/formatter/formatKnowledgeNote";
import { markdownToHtml } from "../src/formatter/markdownToHtml";

const conversation: Conversation = {
  title: "sample",
  url: "https://chatgpt.com/c/sample",
  exportedAt: "2026-01-01T00:00:00.000Z",
  messages: [
    { role: "user", index: 1, text: "Reactの状態管理を教えて" },
    {
      role: "assistant",
      index: 1,
      text: "",
      html: `<p>概要です。</p><h2>useState</h2><p>基本のフックです。</p><ul><li>単純</li><li>局所的</li></ul><h3>例</h3><pre><code class="language-ts">const [a, setA] = useState(0);</code></pre><h2>Redux</h2><p>グローバルな状態です。</p>`,
    },
    { role: "user", index: 2, text: "なるほど" },
    { role: "assistant", index: 2, text: "", html: `<p>他にも質問があればどうぞ。</p>` },
  ],
};

describe("Conversation modes characterization", () => {
  it("Conversation Log", () => {
    const md = formatConversationLog(conversation);
    expect(md).toMatchSnapshot("markdown");
    expect(markdownToHtml(md)).toMatchSnapshot("clipboard html");
  });

  it("Knowledge Note", () => {
    const md = formatKnowledgeNote(conversation);
    expect(md).toMatchSnapshot("markdown");
    expect(markdownToHtml(md)).toMatchSnapshot("clipboard html");
  });
});
