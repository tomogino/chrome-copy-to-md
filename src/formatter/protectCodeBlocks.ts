/**
 * コードブロックを一時プレースホルダーに置換して保護する。
 * 整形後に restoreCodeBlocks() で元に戻す。
 */

const PLACEHOLDER_PREFIX = "\x00CODEBLOCK_";
const PLACEHOLDER_SUFFIX = "\x00";

export interface CodeBlockStore {
  blocks: string[];
}

export function protectCodeBlocks(markdown: string): { protected: string; store: CodeBlockStore } {
  const store: CodeBlockStore = { blocks: [] };
  // triple backtick ブロックを抽出（言語指定あり/なし両対応）
  const protected_ = markdown.replace(/```[\s\S]*?```/g, (match) => {
    const index = store.blocks.length;
    store.blocks.push(match);
    return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
  });
  return { protected: protected_, store };
}

export function restoreCodeBlocks(markdown: string, store: CodeBlockStore): string {
  return markdown.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, "g"),
    (_, index) => store.blocks[parseInt(index, 10)] ?? ""
  );
}
