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
  - 回帰テスト（Vitest + jsdom、2026-10-31〜）
  - Copy Selection 開発用デバッグトレース（2026-10-31〜）
- **未実装**:
  - Chrome Web Storeアイコン（16/48/128px）・説明文
- **MVP外**:
  - 表→リスト変換オプション（README言及あり）
  - トリビアルメッセージフィルターの英語フレーズ対応
  - オプション画面

---

## 3. 現在の実装状況

- **現在どこまでできているか**: 機能完成。3モードのコピーが動作する状態
- **現在のPhase**: Copy Selection 変換精度向上フェーズ（Phase 1・2A・2B 完了）
- **Git**: `main` ブランチ / リモート `https://github.com/tomogino/chrome-copy-to-md.git`（`test.md` は履歴から削除済み・`.gitignore` 対象）

### 直近の実装内容（2026-10-31）

**Phase 1｜開発基盤（変換ロジックは変更なし）:**
- Git 初期化、`.gitignore` 整備（`node_modules/` `dist/` `.env*` `test.md` 等）
- Vitest 2 + jsdom 導入（`vitest.config.ts`、`npm test` / `npm run test:update`）
- Characterization test（現行動作の記録）:
  - `tests/fixtures/selection/*.html` → 本番と同じ `extractSelection → formatSelection → markdownToHtml` に通し、各段階を `tests/__snapshots__/selection/*.{1-extracted.html,2-markdown.md,3-clipboard.html}` にファイル保存。修正前後は `git diff` で比較
  - 部分選択（段落途中の開始/終了など）、変換段階ごとの切り分け、Conversation Log / Knowledge Note のスナップショット
- デバッグトレース: `formatSelection(html, trace?)` に任意の段階コールバックを追加（出力不変をテストで検証）。Popup DevTools で `localStorage.setItem("ccg:debug","1")` すると Extracted HTML / Markdown 各段階 / Clipboard HTML をコンソール出力（`src/debug/selectionDebug.ts`）

**Phase 2A｜入れ子リストの階層保持:**
- 原因: 行頭空白除去の正規表現 `^[ \t]+(?![*\-\d])` がバックトラックし、リストのインデントを常に1スペースに削っていた → `markdownToHtml` の `floor(1/2)=0` で全階層がフラット化
- 修正:
  - `src/formatter/listSyntax.ts` 新設。リスト行判定を集約（`LIST_MARKER` / `NON_LIST_INDENT` / `trimKeepingListIndent`）
  - `htmlToMarkdown.ts`: ul / ol / 単独 li を `listItemToMarkdown()` に統一。li 内コードブロックを保護してから空白整理、子リスト直前の空行除去、本文のない親項目（部分選択時）は出さない
  - `normalizeIndent` と `formatSelection` の末尾 trim も同じ基準に統一
- 共通処理のため Conversation Log / Knowledge Note の入れ子リストも改善
- 仕様テスト `tests/nestedList.test.ts`（期待値を明示したassertion、17件）

### Phase 2B｜文字の連結・変化の修正（2026-11-01）

**くっつく（全モード共通処理 / Selection・Knowledge Note）:**
- `collapseTextParagraphs` を廃止。段落は別段落、`<br>` は改行のまま（Selection / Knowledge Note）
- Knowledge Note は発言・回答を `\n\n` で連結（`**User:**` 行と回答が `<br>` で繋がる問題を解消）
- 空白のみのテキストノードは、インライン要素同士の間なら `" "` として残す（`htmlToMarkdown`）
- 強調内の前後の空白は記号の外に出す（`** a**` → ` **a**`）

**文字が変わる:**
- `src/formatter/inlineSyntax.ts` 新設。本文テキストのエスケープ（`escapeMarkdownText`）とインライン解釈（`tokenizeInline`）を同じ規則で扱う
- KaTeX は `annotation[encoding="application/x-tex"]` から TeX を取り出し `$tex$` / `$$tex$$` で1回だけ出力
- `markdownToHtml` の `unescapeMd` を廃止し、`\` + ASCII記号 の CommonMark 方式に変更（本文のバックスラッシュが消えない）
- インラインコード・数式・エスケープ文字は退避してから強調を解釈。強調は開閉の対応を取る方式（入れ子が崩れない）
- 表は `<table>`（border 付きインラインスタイル）で出力。セル内の書式を保持
- リンク先は括弧の対応が取れない場合や区切り文字を含む場合に符号化（`encodeLinkDestination`）
- `normalizeHeadings` は h5 まで1段階下げる（h5 / h6 は ###### で同じ）
- `escapeForGoogleDocs` はインラインコード・数式を除外して `<tag>` をエスケープ
- 仕様テスト `tests/textFidelity.test.ts`（19件）

**コードブロックの判定（2026-11-06）:**
- 症状: `<pre>` のない構造で、言語ラベルが本文に混ざり、改行がスペースになり、次の段落とつながる
- `src/formatter/codeBlockDom.ts` 新設。`#code-block-viewer` / `.cm-editor` / `.cm-content` もコードブロックとして扱い、直前の言語ラベルを除去
- `<br>` / `div` 区切り / 改行文字のいずれでも行を維持。`<pre>` の外の複数行 `<code>` と、コード内側だけの選択もコードブロックにする
- **未検証**: 上記クラス名は推測で、実 ChatGPT DOM では未確認。症状が残る場合はデバッグトレースの Extracted HTML で確認する

---

## 4. 未完成箇所（既知の制約・バグ）

### Bug A: コードブロック内の余計な空行 【Google Docs 制約として受け入れ済み】

- **症状**: Google Docs に貼り付けると、コード各行の間に空行が入る
- **根本原因（確定）**: Google Docs は HTML ペースト時にすべてのブロック要素を段落として扱い、デフォルト段落間隔を付与する。`<pre><code>` でも同様。CSS制御不可。
- **対応**: `<table>` 方式等の追加試行はせず、制約として受け入れ。Plain Text コピーでは空行は入らない。

### テストで確認済みの未修正不具合（Phase 1 調査、2026-10-31）

| # | 不具合 | 箇所 |
|---|---|---|
| # | 不具合 | 箇所 | 状態 |
|---|---|---|---|
| 1 | 表が Clipboard HTML で `<table>` にならず、パイプ文字列の `<p>` になる。セル内書式も消える | `markdownToHtml.ts` | 修正済（2B） |
| 2 | インラインコード内の `*` が `<em>` に変換される（`a * b * c`） | `markdownToHtml.ts` の `inlineToHtml` | 修正済（2B） |
| 3 | `***x***` → `<strong><em>x</strong></em>`（タグ入れ子崩れ）。`<del>` は書式が消える | 同上 / `htmlToMarkdown.ts` | 入れ子は修正済（2B）。`<del>` は未対応のまま（要素消失は許容） |
| 4 | 見出し h4 と h5 がどちらも `#####` になる | `normalizeHeadings` | 修正済（2B）。h5 / h6 は ###### で同じ |
| 5 | `---` 区切り線は h1 がある場合しか入らない（見出しを下げた後に `## ` を探すため）。元の `<hr>` は削除される | `insertSectionDividers` | 未修正（要素消失は許容） |
| 6 | 段落結合時に英文同士が空白なしで連結（`paragraph.This`）。`<br>` の改行も消える | `collapseTextParagraphs` | 修正済（2B、関数ごと廃止） |
| 7 | `[aria-label]` 除去で本文要素（例: aria-label 付きリンク）まで消える | `extractConversation.ts` | 未修正（要素消失は許容） |
| 8 | `<tag>` エスケープが「文書のそれ以降にバッククォートがあるか」で変わる（text/plain 側のみ影響） | `escapeForGoogleDocs` | 修正済（2B） |
| 9 | Conversation Log で Assistant 本文の h2 がターン見出しと同じ `###` になる | `formatConversationLog.ts` の `shiftAssistantHeadings` | 未修正 |
| 10 | Knowledge Note で `**User:**` 行と直後の回答が `<br>` で連結、2つ目の回答が前の段落に結合される | `formatKnowledgeNote.ts` | 修正済（2B） |
| 11 | 番号付きリストの `start` 属性を無視し、途中から選択すると 1 から振り直す | `htmlToMarkdown.ts` の `ol` | 未修正 |

### リスト関連の残課題（Phase 2A 時点）

- 親 ul/ol を含まない部分選択では単独 li が `•` 扱いになり、元の番号（`start` 属性）も引き継がない
- li 内の2段落目以降はインデントなし通常段落になる（Phase 2B で直前項目への結合はなくなった）
- li 内テキストに改行（整形HTML）が含まれると、後半が通常段落として分かれる

### 未検証事項

- fixture は実 ChatGPT DOM を模して手書きしたもので、実DOMからの取得ではない（li 内が `<p>` 包みか、aria-label の付き方など）
- Google Docs への実際の貼り付け結果（NBSP 字下げ幅・`margin:0` の効き）

---

## 5. 現在のタスク / 次候補タスク

優先順:

1. **[高] 実DOMの fixture 化**
   - デバッグトレースの「1. Extracted HTML」を取得し `tests/fixtures/selection/` に追加（入れ子2階層以上・ol 内 ul・リスト途中からの選択・表・引用リンクなど）
2. **[高] インライン書式の修正**（§4 #2, #3）: `inlineToHtml` でインラインコードを先にプレースホルダー退避、`***` 専用ルール
3. **[中] 段落結合の修正**（§4 #6）: 英数字同士の結合時に半角スペース、`<br>` の扱いを仕様化
4. **[中] 見出し・区切り線の仕様整理**（§4 #4, #5）
5. **[中] 表の `<table>` 出力**（§4 #1、Google Docs で手動確認が必要）
6. **[中] `[aria-label]` 除去の絞り込み**（§4 #7、実DOM確認後）
7. **[高・継続] DOMセレクター変更への対応確認**（`SELECTORS` オブジェクト）
8. **[低] Knowledge Note トリビアルフィルターの英語対応**

---

## 6. 重要な設計判断

- **クリップボード戦略**: Promise-based `ClipboardItem` で `text/html` + `text/plain` を同時書き込み。`buildContent()` Promise を先行起動し `clipboard.write()` を handleCopy 最初の `await` として呼ぶことで user activation を保持する。失敗時はプレーンテキストにフォールバック（ステータスに「テキスト形式」と表示）
- **段落は結合しない**（Phase 2B）: ChatGPT 上の表示どおり段落・改行を保つ。旧 `collapseTextParagraphs` は英文が連結されるため廃止
- **Markdown エスケープ規則**（Phase 2B、`inlineSyntax.ts`）: 本文の `` \ ` * $ [ ] `` は常に、`# - > | --- 1.` は行頭のときだけ `\` でエスケープする。`markdownToHtml` は `\` + ASCII記号 を記号そのものとして扱う。text/plain（Markdown）には `\*` 等が残るが、Markdown として正しい表記
- **数式**: KaTeX は TeX ソースを `$…$` / `$$…$$` で出力（Google Docs では数式として描画されない）。本文の `$` はエスケープするため、エスケープされていない `$` は数式の区切りのみ
- **コードブロック保護（NULLバイトプレースホルダー）**: Markdown正規化処理がコードブロック内を誤変換しないよう `\x00CODEBLOCK_N\x00` で置換保護する。全normalizer関数と `listItemToMarkdown` はこの前提で動く
- **Google Docs向けリスト変換**: `markdownToHtml.ts` では `<ul><li>` を使わず `<p style="margin:0;">` + `•` 記号で出力。字下げは **NBSP（U+00A0）×4 / 階層**（全角スペースではない）。Google Docs で `<ul><li>` は「書式クリア」後にインデントが残る不具合回避
- **リストのインデント規約**: Markdown 上は **2スペース / 階層**。リスト行判定は `listSyntax.ts` に集約し、htmlToMarkdown / normalizeIndent / formatSelection で同じ基準を使う。行頭空白除去は `(?![ \t])` で空白を最後まで消費させ、バックトラックを防ぐ
- **部分選択時のリスト階層**: 子リストの途中から選択した場合は空の親項目を出さず、元の階層（字下げ）を維持する（`trimKeepingListIndent`）
- **DOMセレクター集約**: `extractConversation.ts` の `SELECTORS` オブジェクト1箇所に集約
- **Knowledge Noteのトリビアルフィルター**: 日本語の定型フレーズのみ対応
- **`blockquote`**: `>` プレフィックスなしで内容だけ取り出す仕様
- **Selection Copy のUI除去**: `cloneContents()` で取得した断片からボタン・SVG・aria-label 要素を除去してからHTMLパース
- **テスト方針**: characterization test（現行動作の記録）と仕様テスト（正しい期待値）を分ける。修正で出力が変わったら `npm run test:update` → `git diff` でスナップショット差分を確認・説明する
- **デバッグ出力**: Popup の DevTools コンソールのみ。外部送信・恒久保存はしない（localStorage には有効フラグのみ）

---

## 7. コピー時のスタイリング仕様

### 7-1. HTML→Markdown 変換（`htmlToMarkdown.ts`）

ChatGPT DOM の HTML を Markdown テキストに変換する（DOM API 使用、popup 内で実行）。

| HTML要素 | Markdown出力 |
|---|---|
| `<p>` | テキスト + `\n\n` |
| `<h1>`〜`<h6>` | `#`〜`######` + `\n\n` |
| `<strong>`, `<b>` | `**text**` |
| `<em>`, `<i>` | `*text*` |
| `<code>`（インライン） | `` `text` ``（中に `` ` `` があればより長い区切り） |
| KaTeX（`.katex` / `.katex-display`） | `$tex$` / `$$tex$$` |
| テキストノード | `escapeMarkdownText` でエスケープ。インライン要素間の空白のみのノードは `" "` |
| `<pre><code>` / エディタ部品（`CODE_VIEWER_SELECTOR`） | ` ```lang\ncode\n``` ` + `\n\n`（言語ラベルは出力しない） |
| `<ul><li>` | `- item`（2スペース/階層、`listItemToMarkdown`） |
| `<ol><li>` | `1. item`（同上） |
| 単独 `<li>`（部分選択） | `- item` |
| `<a>` | `[text](href)`（href は `encodeLinkDestination`） |
| `<br>` | `\n` |
| `<hr>` | `\n---\n\n` |
| `<blockquote>` | `>` プレフィックスなし・内容のみ取り出す |
| `<table>` | Markdown テーブル形式（`\|col\|col\|`）。セル内の書式を保持 |
| `<div>`, `<span>` 等 | 透過（子ノードをそのまま処理） |

### 7-2. Markdown正規化（`normalizeMarkdown.ts`）

| 関数 | 処理内容 |
|---|---|
| `normalizeBullets` | `- ` → `* ` に統一 |
| `normalizeHeadings` | `#`〜`#####` を1段階下げ（`######` は据え置き → h5/h6 は同じ） |
| `normalizeIndent` | リスト行以外の行頭スペース・タブを除去（`NON_LIST_INDENT`） |
| `replaceDoubleQuotes` | `"text"` → `「text」`（U+201C/201D → 日本語括弧） |
| `escapeForGoogleDocs` | `<tag>` をエスケープ（インラインコード・数式は除外。`markdownToHtml` で戻されるため text/plain 側のみ有効） |
| `insertSectionDividers` | `## ` 見出しの前に `---` 挿入（既存 `---` は削除） |

### 7-3. Markdown→HTML 変換（`markdownToHtml.ts`）

クリップボードの `text/html` として書き込む最終HTML。Google Docs 向けに調整済み。

| Markdown要素 | HTML出力 | Google Docs 備考 |
|---|---|---|
| 通常テキスト | `<p>content</p>`（連続行は `<br>` 区切り） | — |
| `**text**` | `<strong>text</strong>` | bold 表示 |
| `*text*` | `<em>text</em>` | italic 表示。`***x***` は `<strong><em>`。開閉の対応を取るため入れ子は崩れない |
| `\X`（X は ASCII記号） | `X` | エスケープされた記号は記法として解釈しない |
| `$tex$` / `$$tex$$` | そのまま（中身を解釈しない） | 数式として描画はされない |
| `` `code` `` | `<code>code</code>` | インラインコード体裁 |
| ` ```lang\ncode\n``` ` | `<pre><code class="language-lang">...</code></pre>` | **各行に段落間隔が入る（制約・受け入れ済み）** |
| `# 〜 ######` | `<h1>`〜`<h6>` | 見出しスタイル |
| `* item` / `- item` | `<p style="margin:0;">` + NBSP×4×階層 + `•&nbsp;item` | 階層 = 行頭空白数 / 2 |
| `1. item` | `<p style="margin:0;">` + NBSP×4×階層 + `1.&nbsp;item` | 同上 |
| `---` | `<hr>` | 水平線 |
| `> text` | `<blockquote><p>text</p></blockquote>` | 現在の出力経路では未使用 |
| `[text](url)` | `<a href="url">text</a>` | ハイパーリンク |
| 表（ヘッダー + `\| --- \|` 区切り行） | `<table>`（セルに border/padding のインラインスタイル） | Google Docs での見た目は未確認 |

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
※ Assistantの見出しは `shiftAssistantHeadings` で1段階下げるが、h2 → `###` でターン見出しと衝突する（§4 #9）

#### Knowledge Note（`formatKnowledgeNote.ts`）

```
**User:** ユーザー発言（非トリビアルのみ）
アシスタント回答本文
...
```

適用normalizer: `normalizeHeadings` → `normalizeBullets` → `normalizeIndent` → `replaceDoubleQuotes` → `escapeForGoogleDocs` → `insertSectionDividers`（発言・回答は `\n\n` で区切る。User 発言は `escapeMarkdownText` でエスケープ）
※ トリビアル日本語フレーズ（「続けて」「なるほど」「OK」等）はUser発言を除外

#### Selection Copy（`formatSelection.ts`）

選択範囲のHTMLをそのまま変換。ターン構造なし。Knowledge Note と同じ normalizer パイプラインを適用し、最後に `trimKeepingListIndent`。

適用normalizer: `normalizeHeadings` → `normalizeBullets` → `normalizeIndent` → `replaceDoubleQuotes` → `escapeForGoogleDocs` → `insertSectionDividers`

---

## 8. リスク・注意点

| リスク | 詳細 | 対処 |
|--------|------|------|
| **[高] DOMセレクター破損** | ChatGPT UI変更で `[data-message-author-role]` や `.markdown` が消えると全機能停止 | `SELECTORS` オブジェクトを更新 |
| **[高] fixture と実DOMの乖離** | テスト fixture は手書きの近似。実DOM構造が異なると、テストが通っても実環境で崩れうる | デバッグトレースで実DOMを取得し fixture 化 |
| **[高] Google Docs コードブロック空行** | Google Docs の段落間隔が HTML ペースト時にコード各行に付く。CSS での制御不可 | 制約として受け入れ済み（Plain Text コピーで回避可） |
| **[中] エスケープ規則の一貫性** | `inlineSyntax.ts` の規則と `markdownToHtml` の解釈がずれると記号が消える・増える | `tests/textFidelity.test.ts` で往復を検証 |
| **[中] 共通 normalizer の波及** | `normalizeMarkdown.ts` / `htmlToMarkdown.ts` / `listSyntax.ts` の修正は3モードすべてに影響 | `tests/conversationModes.test.ts` で回帰検知 |
| **[低] `escapeForGoogleDocs` の `<tag>` エスケープ** | 正規表現が簡易版で、後続のバッククォート有無に依存 | 実害は限定的（text/plain のみ） |
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
│   │   ├── htmlToMarkdown.ts      # HTML→Markdown（DOMトラバーサル、listItemToMarkdown）
│   │   ├── codeBlockDom.ts        # コードブロックのDOM判定・言語ラベル除去（content script と共用）
│   │   ├── inlineSyntax.ts        # Markdownエスケープ・インライン分解（escapeMarkdownText / tokenizeInline）
│   │   ├── markdownToHtml.ts      # Markdown→HTML（ClipboardItem用、popup.tsから呼ばれる）
│   │   ├── normalizeMarkdown.ts   # Markdown正規化群（見出し/箇条書き/段落/エスケープ）
│   │   ├── listSyntax.ts          # リスト行判定の集約（LIST_MARKER / NON_LIST_INDENT / trimKeepingListIndent）
│   │   ├── protectCodeBlocks.ts   # コードブロック保護/復元（全normalizerの前提・触らない）
│   │   ├── formatConversationLog.ts # モード1: 全会話ターン形式
│   │   ├── formatKnowledgeNote.ts   # モード2: アシスタント中心のノート形式
│   │   └── formatSelection.ts       # モード3: 選択範囲を変換（任意の段階トレース付き）
│   ├── debug/
│   │   └── selectionDebug.ts      # Copy Selection デバッグ出力（localStorage "ccg:debug" で有効化）
│   ├── clipboard/
│   │   └── copyToClipboard.ts     # ※現在popup.tsから未使用。将来の再利用のために残存
│   └── popup/
│       ├── popup.html             # Popup UI（ボタン3種 + ステータス表示）
│       ├── popup.ts               # Popupロジック（Promise-based ClipboardItem + フォールバック）
│       └── popup.css              # ダークテーマスタイル（btn-primary/secondary/tertiary）
├── tests/
│   ├── helpers.ts                 # 全体選択→抽出、本番同順のパイプライン実行
│   ├── fixtures/selection/*.html  # Copy Selection 入力 fixture（手書きの近似）
│   ├── __snapshots__/             # characterization スナップショット（selection/ は段階別ファイル）
│   ├── selection.fixtures.test.ts # fixture 一括 characterization + tracer 不変性
│   ├── selection.partial.test.ts  # 部分選択の characterization
│   ├── stages.test.ts             # 不具合の段階別切り分け記録
│   ├── conversationModes.test.ts  # Conversation Log / Knowledge Note 回帰
│   ├── nestedList.test.ts         # 入れ子リスト仕様テスト（正しい期待値）
│   └── textFidelity.test.ts       # 文字の連結・変化の仕様テスト（正しい期待値）
├── PROJECT_CONTEXT.md             # このファイル
├── vite.config.ts                 # ビルド設定（popup + contentScript 2エントリー）
├── vitest.config.ts               # テスト設定（jsdom）
├── tsconfig.json
├── package.json                   # scripts: dev / build / test / test:watch / test:update
└── dist/                          # ビルド成果物（Chromeに読み込む・git管理外）
```

---

*最終更新: 2026-11-06（コードブロック判定: `<pre>` なし構造・言語ラベル除去・改行維持）/ 2026-11-01（Phase 2B: 段落結合の廃止・インライン空白保持・Markdown エスケープ規則・数式・表・強調入れ子・リンク先符号化・見出しレベル）/ 2026-10-31（Phase 1: Git・テスト基盤・デバッグトレース追加 / Phase 2A: 入れ子リストの階層保持を修正、listSyntax.ts 新設、既知不具合一覧を §4 に追加）*
