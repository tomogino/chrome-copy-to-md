# PROJECT_CONTEXT

> このファイルはAI支援開発の再開を高速化するためのコンテキストファイルです。

---

## 1. アプリ概要

- **何のアプリか**: ChatGPTの会話をクリップボードにコピーするChrome拡張機能（Manifest V3）
- **誰向けか**: ChatGPT会話をGoogle Docsで文書化・整理したい日本語話者
- **コア価値**: 会話をコピペ1操作でGoogle Docs向けに最適化された形式（HTML + Markdownテキスト）で出力する
- **やらないこと**:
  - ChatGPT以外のAIサービス対応（Claude, Gemini等）
  - ファイル保存・エクスポート（クリップボードのみ）
  - 会話の編集・フィルタリングUI
  - バックグラウンド同期・クラウド保存

---

## 2. MVPスコープ

- **現在のMVP範囲**: 3モードのコピー機能（HTML + plain text 両形式）
- **実装済み**:
  - Popupボタン3種（Conversation Log / Knowledge Note / Selection Copy）
  - ChatGPT DOMからの会話抽出（`extractConversation.ts`）
  - ページ選択範囲の抽出（`extractSelection()`）
  - HTML → Markdown変換（`htmlToMarkdown.ts`）
  - Markdown → HTML変換（`markdownToHtml.ts`）
  - Markdown正規化（見出し/箇条書き/引用/エスケープ/段落結合）
  - コードブロック保護機構
  - クリップボードコピー（Promise-based ClipboardItem で HTML+テキスト同時）
  - content script 動的注入リトライ
  - ダークテーマPopup UI
- **未実装**:
  - ユニットテスト
  - Chrome Web Storeアイコン（16/48/128px）・説明文
- **MVP外**:
  - 表→リスト変換オプション（README言及あり）
  - トリビアルメッセージフィルターの英語フレーズ対応
  - オプション画面

---

## 3. 現在の実装状況

- **現在どこまでできているか**: 機能完成。3モードのコピーが動作する状態
- **現在のPhase**: 品質改善フェーズ（主要バグ解消済み）

- **直近の実装内容**（2026-05-24）:

  **Selection Copy 機能追加:**
  - `extractConversation.ts`: `extractSelection()` 追加 — `getSelection().getRangeAt(0).cloneContents()` → UI要素（button/svg/aria-label）除去 → innerHTML
  - `contentScript.ts`: `selectionCopy` モードのハンドラ追加
  - `formatter/formatSelection.ts`: 新規 — Knowledge Note と同じ normalizer パイプライン（`normalizeHeadings` → `normalizeBullets` → `normalizeIndent` → `replaceDoubleQuotes` → `escapeForGoogleDocs` → `insertSectionDividers` → `collapseTextParagraphs`）
  - `popup.ts`: `selectionCopy` 分岐追加、件数表示を条件付きに（Selection は件数なし）
  - `popup.html`: "Copy Selection" ボタン追加（✂️アイコン、紫系）
  - `popup.css`: `btn-tertiary`（`#3d2a5a`）追加

  **コードクリーンアップ（Bug A/B 修正残骸の除去）:**
  - `markdownToHtml.ts`: コードブロックを `<p>+<br>+&nbsp;` ハック → 自然な `<pre><code>` に戻す
  - `htmlToMarkdown.ts`: `pre` ハンドラの `\n{2,}→\n`（空行まで消す過剰処理）→ `\n{3,}→\n\n` に戻す
  - `popup.ts`: DEBUGログ（`console.log`）2行削除

---

## 4. 未完成箇所（既知の制約・バグ）

### Bug A: コードブロック内の余計な空行 【Google Docs 制約として受け入れ済み】

- **症状**: Google Docs に貼り付けると、コード各行の間に空行が入る
- **根本原因（確定）**: Google Docs は HTML ペースト時にすべてのブロック要素を段落として扱い、デフォルト段落間隔を付与する。`<pre><code>` でも同様。CSS制御不可。
- **対応**: `<table>` 方式等の追加試行はせず、制約として受け入れ。Plain Text コピーでは空行は入らない。

---

## 5. 現在のタスク / 次候補タスク

優先順:

1. **[高] DOMセレクター変更への対応確認**
   - ChatGPT UIは頻繁に変更される
   - `[data-message-author-role]` と `.markdown` / `[class*="prose"]` が現在も有効か確認
   - 対象: `src/content/extractConversation.ts` の `SELECTORS` オブジェクト
2. **[中] 主要関数のユニットテスト追加**
   - `htmlToMarkdown`, `normalizeMarkdown`, `formatConversationLog`, `formatKnowledgeNote` は純粋関数
   - Vitest 導入でテスト容易
3. **[低] Knowledge Note トリビアルフィルターの英語対応**

---

## 6. 重要な設計判断

- **クリップボード戦略**: Promise-based `ClipboardItem` で `text/html` + `text/plain` を同時書き込み。`buildContent()` Promise を先行起動し `clipboard.write()` を handleCopy 最初の `await` として呼ぶことで user activation を保持する。失敗時はプレーンテキストにフォールバック（ステータスに「テキスト形式」と表示）
- **コードブロック保護（NULLバイトプレースホルダー）**: Markdown正規化処理がコードブロック内を誤変換しないよう `\x00CODEBLOCK_N\x00` で置換保護する。全normalizer関数はこの前提で動く
- **Google Docs向けリスト変換**: `markdownToHtml.ts` では `<ul><li>` を使わず `<p style="margin:0;">` + `•` 記号で出力。Google Docs で `<ul><li>` は「書式クリア」後にインデントが残る不具合回避
- **DOMセレクター集約**: `extractConversation.ts` の `SELECTORS` オブジェクト1箇所に集約
- **Knowledge Noteのトリビアルフィルター**: 日本語の定型フレーズのみ対応
- **`blockquote`**: `>` プレフィックスなしで内容だけ取り出す仕様
- **Selection Copy のUI除去**: `cloneContents()` で取得した断片からボタン・SVG・aria-label 要素を除去してからHTMLパース

---

## 7. コピー時のスタイリング仕様

### 7-1. HTML→Markdown 変換（`htmlToMarkdown.ts`）

ChatGPT DOM の HTML を Markdown テキストに変換する。content script 内で実行（DOM API 使用）。

| HTML要素 | Markdown出力 |
|---|---|
| `<p>` | テキスト + `\n\n` |
| `<h1>`〜`<h6>` | `#`〜`######` + `\n\n` |
| `<strong>`, `<b>` | `**text**` |
| `<em>`, `<i>` | `*text*` |
| `<code>`（インライン） | `` `text` `` |
| `<pre><code>` | ` ```lang\ncode\n``` ` + `\n\n` |
| `<ul><li>` | `- item`（インデントレベル保持） |
| `<ol><li>` | `1. item`（インデントレベル保持） |
| `<a>` | `[text](href)` |
| `<br>` | `\n` |
| `<hr>` | `\n---\n\n` |
| `<blockquote>` | `>` プレフィックスなし・内容のみ取り出す |
| `<table>` | Markdown テーブル形式（`\|col\|col\|`） |
| `<div>`, `<span>` 等 | 透過（子ノードをそのまま処理） |

### 7-2. Markdown正規化（`normalizeMarkdown.ts`）

| 関数 | 処理内容 |
|---|---|
| `normalizeBullets` | `- ` → `* ` に統一 |
| `normalizeHeadings` | `#` → `##` に1段階下げ（Knowledge Note用） |
| `normalizeIndent` | 行頭の不要スペース・タブ除去（ネストリストのインデントは保持） |
| `replaceDoubleQuotes` | `"text"` → `「text」`（U+201C/201D → 日本語括弧） |
| `escapeForGoogleDocs` | `<tag>` をエスケープ（インラインコード外のみ） |
| `insertSectionDividers` | `##` 見出し間に `---` 挿入 |
| `collapseTextParagraphs` | 連続する通常テキスト段落を1行に結合（Knowledge Note用） |

### 7-3. Markdown→HTML 変換（`markdownToHtml.ts`）

クリップボードの `text/html` として書き込む最終HTML。Google Docs 向けに調整済み。

| Markdown要素 | HTML出力 | Google Docs 備考 |
|---|---|---|
| 通常テキスト | `<p>content</p>` | — |
| `**text**` | `<strong>text</strong>` | bold 表示 |
| `*text*` | `<em>text</em>` | italic 表示 |
| `` `code` `` | `<code>code</code>` | インラインコード体裁 |
| ` ```lang\ncode\n``` ` | `<pre><code class="language-lang">...</code></pre>` | **各行に段落間隔が入る（制約・受け入れ済み）** |
| `# 〜 ######` | `<h1>`〜`<h6>` | 見出しスタイル |
| `* item` / `- item` | `<p style="margin:0;">•&nbsp;item</p>` | `<ul><li>` 不使用（書式クリア後のインデント残留回避） |
| `1. item` | `<p style="margin:0;">1.&nbsp;item</p>` | `<ol><li>` 不使用（同上） |
| `---` | `<hr>` | 水平線 |
| `> text` | `<blockquote><p>text</p></blockquote>` | — |
| `[text](url)` | `<a href="url">text</a>` | ハイパーリンク |

### 7-4. モード別フォーマット仕様

#### Conversation Log（`formatConversationLog.ts`）

```
## Conversation Log

### 01｜User
ユーザー発言

### 01｜Assistant
アシスタント回答（見出しを1段階下げ）
...
```

適用normalizer: `normalizeBullets` → `normalizeIndent` → `replaceDoubleQuotes` → `escapeForGoogleDocs`
※ Assistantの見出しは `shiftAssistantHeadings` で1段階下げ（`###` ターン見出しとの衝突回避）

#### Knowledge Note（`formatKnowledgeNote.ts`）

```
**User:** ユーザー発言（非トリビアルのみ）

アシスタント回答本文

---

## 次のセクション見出し
...
```

適用normalizer: `normalizeHeadings` → `normalizeBullets` → `normalizeIndent` → `replaceDoubleQuotes` → `escapeForGoogleDocs` → `insertSectionDividers` → `collapseTextParagraphs`
※ トリビアル日本語フレーズ（「続けて」「なるほど」「OK」等）はUser発言を除外

#### Selection Copy（`formatSelection.ts`）

選択範囲のHTMLをそのまま変換。ターン構造なし。Knowledge Note と同じ normalizer パイプラインを適用。

適用normalizer: `normalizeHeadings` → `normalizeBullets` → `normalizeIndent` → `replaceDoubleQuotes` → `escapeForGoogleDocs` → `insertSectionDividers` → `collapseTextParagraphs`

---

## 8. リスク・注意点

| リスク | 詳細 | 対処 |
|--------|------|------|
| **[高] DOMセレクター破損** | ChatGPT UI変更で `[data-message-author-role]` や `.markdown` が消えると全機能停止 | `SELECTORS` オブジェクトを更新 |
| **[高] Google Docs コードブロック空行** | Google Docs の段落間隔が HTML ペースト時にコード各行に付く。CSS での制御不可 | 制約として受け入れ済み（Plain Text コピーで回避可） |
| **[中] `collapseTextParagraphs` の複雑性** | `normalizeMarkdown.ts` の170行ロジック。AI修正時に改行処理の挙動が変わりやすい | 変更前にエッジケースをテストで固める |
| **[低] `escapeForGoogleDocs` の `<tag>` エスケープ** | インラインコード内の `<tag>` を除外する正規表現が簡易版 | 実害は限定的 |
| **触らない箇所** | `protectCodeBlocks.ts`（全normalizerの前提）、`conversation.ts`（型契約） | 変更は全フォーマッターに影響 |

---

## 9. 主要ファイル構成

```
CopyChatGPT/
├── public/
│   └── manifest.json              # Chrome拡張マニフェスト（MV3）
├── src/
│   ├── types/
│   │   └── conversation.ts        # 共有型定義（Conversation, CopyMode, ExtractResult）
│   ├── content/
│   │   ├── contentScript.ts       # content scriptエントリー（メッセージ受信→抽出呼び出し）
│   │   └── extractConversation.ts # ChatGPT DOMから会話抽出 + 選択範囲抽出（SELECTORSオブジェクト集約）
│   ├── formatter/
│   │   ├── htmlToMarkdown.ts      # HTML→Markdown（DOMトラバーサル、popup内で実行）
│   │   ├── markdownToHtml.ts      # Markdown→HTML（ClipboardItem用、popup.tsから呼ばれる）
│   │   ├── normalizeMarkdown.ts   # Markdown正規化群（見出し/箇条書き/段落/エスケープ）
│   │   ├── protectCodeBlocks.ts   # コードブロック保護/復元（全normalizerの前提・触らない）
│   │   ├── formatConversationLog.ts # モード1: 全会話ターン形式
│   │   ├── formatKnowledgeNote.ts   # モード2: アシスタント中心のノート形式
│   │   └── formatSelection.ts       # モード3: 選択範囲をそのまま変換
│   ├── clipboard/
│   │   └── copyToClipboard.ts     # ※現在popup.tsから未使用。将来の再利用のために残存
│   └── popup/
│       ├── popup.html             # Popup UI（ボタン3種 + ステータス表示）
│       ├── popup.ts               # Popupロジック（Promise-based ClipboardItem + フォールバック）
│       └── popup.css              # ダークテーマスタイル（btn-primary/secondary/tertiary）
├── PROJECT_CONTEXT.md             # このファイル
├── vite.config.ts                 # ビルド設定（popup + contentScript 2エントリー）
├── tsconfig.json
├── package.json                   # scripts: dev（watch）/ build
└── dist/                          # ビルド済み成果物（Chromeに読み込む）
```

---

*最終更新: 2026-05-24（Selection Copy 追加・Knowledge Note と同一 normalizer パイプラインに統一、Bug A/B 修正残骸クリーンアップ、スタイリング仕様を7節に追加）*
