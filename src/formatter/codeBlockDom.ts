/**
 * ChatGPT のコードブロックを DOM から判定する。
 * <pre><code> を持たない、エディタ部品（CodeMirror）で描画される構造にも対応する。
 */

/** <code> の代わりにコード本文を持つ要素 */
export const CODE_VIEWER_SELECTOR = "#code-block-viewer, .cm-editor, .cm-content";

/** 言語ラベルとみなす文字数の上限（"プレーンテキスト" "typescript" など） */
const MAX_LABEL_LENGTH = 40;

function isBlank(node: Node): boolean {
  return !(node.textContent || "").trim();
}

function isLabelElement(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as Element;
  return (
    /^(div|span)$/i.test(el.tagName) &&
    el.querySelector("p, pre, code, ul, ol, table, blockquote, h1, h2, h3, h4, h5, h6") === null &&
    (el.textContent || "").trim().length <= MAX_LABEL_LENGTH
  );
}

/**
 * コード本文の直前にある言語ラベルを取り除く。
 * ラベルは本文の祖先の兄弟として置かれるため、root まで遡って最初に見つかった内容を確認する。
 */
export function removeCodeBlockLabels(root: Element): void {
  root.querySelectorAll(CODE_VIEWER_SELECTOR).forEach((viewer) => {
    if (viewer.parentElement?.closest(CODE_VIEWER_SELECTOR)) return;

    for (let node: Element | null = viewer; node && node !== root; node = node.parentElement) {
      let prev = node.previousSibling;
      while (prev && isBlank(prev)) prev = prev.previousSibling;
      if (!prev) continue;
      if (isLabelElement(prev)) prev.parentNode!.removeChild(prev);
      return;
    }
  });
}
