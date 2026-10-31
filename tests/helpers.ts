import { extractSelection } from "../src/content/extractConversation";
import { formatSelection } from "../src/formatter/formatSelection";
import { markdownToHtml } from "../src/formatter/markdownToHtml";

/**
 * HTMLを document に配置し、コンテナ全体を選択した状態で extractSelection を呼ぶ。
 * ユーザーがChatGPT上で回答全体をドラッグ選択した状況に相当する。
 */
export function extractFromHtml(html: string): string {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  const root = document.getElementById("root")!;
  const range = document.createRange();
  range.selectNodeContents(root);
  selectRange(range);
  return extractSelection();
}

export function selectRange(range: Range): void {
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** popup.ts の selectionCopy 分岐と同じ順序で変換する */
export function runSelectionPipeline(extractedHtml: string) {
  const markdown = formatSelection(extractedHtml);
  const clipboardHtml = markdownToHtml(markdown);
  return { markdown, clipboardHtml };
}

/** XPath風にテキストノードを探す（テストで選択開始/終了位置を決めるため） */
export function findTextNode(root: Node, includes: string): Text {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if ((node.textContent || "").includes(includes)) return node as Text;
  }
  throw new Error(`text node not found: ${includes}`);
}
