# ChatGPT Markdown Exporter

ChatGPTの会話をMarkdown形式でコピーし、Google Docsに貼り付けやすく整形するChrome拡張機能。

## 機能

- **Copy as Conversation Log** — User/Assistantの全発言を順番通りに保存
- **Copy as Styled Knowledge Note** — Assistant回答を中心に知識ノートとして整形

## ビルド手順

```bash
# 依存パッケージをインストール
npm install

# ビルド
npm run build

# 開発時（ファイル変更を監視して自動ビルド）
npm run dev
```

ビルド後、`dist/` ディレクトリが生成されます。

## Chromeへの読み込み手順

1. Chrome で `chrome://extensions` を開く
2. 右上の **「デベロッパーモード」** をオンにする
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. `dist/` ディレクトリを選択する
5. 拡張機能一覧に「ChatGPT Markdown Exporter」が表示されればOK

## 使い方

1. ChatGPT (`https://chatgpt.com/`) で会話を開く
2. ブラウザ右上の拡張機能アイコンをクリック
3. 目的に応じてボタンを選択：
   - **Copy as Conversation Log** — 全会話をそのまま保存したいとき
   - **Copy as Styled Knowledge Note** — 読み返し用のノートにしたいとき
4. クリップボードにコピーされたらGoogle Docsに貼り付ける

## ディレクトリ構成

```
src/
  types/
    conversation.ts         — 共通型定義
  content/
    extractConversation.ts  — DOM から会話を抽出（セレクタ集約）
    contentScript.ts        — content script エントリーポイント
  formatter/
    protectCodeBlocks.ts    — コードブロック保護ユーティリティ
    htmlToMarkdown.ts       — HTML → Markdown 変換
    normalizeMarkdown.ts    — Markdown正規化（見出し/箇条書き/区切り/エスケープ）
    formatConversationLog.ts — Conversation Log 整形
    formatKnowledgeNote.ts  — Knowledge Note 整形
  clipboard/
    copyToClipboard.ts      — クリップボードコピー
  popup/
    popup.html              — Popup UI
    popup.ts                — Popup ロジック
    popup.css               — Popup スタイル
```

## Markdownスタイルのルール

| ルール | 内容 |
|--------|------|
| 見出し | `##` から開始（`#` は使わない） |
| 区切り線 | `##` セクション間のみ `---` を挿入 |
| 箇条書き | `*` に統一 |
| エスケープ | 見出し内の番号 `1.` → `1\.`、`<tag>` → `\<tag\>` |
| コードブロック | 完全に保護（一切変換しない） |

## ChatGPT DOM変更への対応

`src/content/extractConversation.ts` の `SELECTORS` オブジェクトにセレクタを集約しています。
ChatGPTのUI変更でコピーが動作しなくなった場合は、ここを確認・修正してください。

```ts
const SELECTORS = {
  allMessages: '[data-message-author-role]',
  // ...
};
```

## 開発メモ

- Markdown整形関数は純粋関数として実装しているので、単体テストが容易
- コードブロック保護は `protectCodeBlocks()` / `restoreCodeBlocks()` のペアで実装
- 将来的に「表→リスト変換」オプションを追加する場合は `formatKnowledgeNote.ts` を拡張する

## テスト

```bash
npm test             # 回帰テスト（Vitest + jsdom）
npm run test:update  # 変換結果が意図通り変わったときにスナップショットを更新
```

- `tests/fixtures/selection/*.html` を追加すると、Copy Selection の各段階の出力が
  `tests/__snapshots__/selection/` に記録される（`1-extracted.html` / `2-markdown.md` / `3-clipboard.html`）
- 現在のスナップショットは「現行動作の記録」であり、正しい期待値とは限らない。修正時は `git diff` で前後比較する

## デバッグ（Copy Selection）

Popup を右クリック →「検証」で開いた DevTools コンソールで以下を実行すると、
次回以降の Copy Selection で Extracted HTML / Markdown 各段階 / Clipboard HTML がコンソールに出力される。

```js
localStorage.setItem("ccg:debug", "1")   // 有効化
localStorage.removeItem("ccg:debug")     // 無効化
```

出力先は Popup のコンソールのみで、外部送信や保存は行わない。
