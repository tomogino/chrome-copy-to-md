/**
 * テキストをクリップボードにコピーする。
 * html が渡された場合は text/html + text/plain の両形式で書き込む（Google Docs 向け）。
 * html がない場合はプレーンテキストのみ。
 */

/**
 * contenteditable + execCommand でHTMLを含むリッチテキストをクリップボードにコピーする。
 * ClipboardItem が transient activation 切れ等で失敗した場合のフォールバック。
 */
function copyHtmlViaExecCommand(html: string): boolean {
  const div = document.createElement("div");
  div.contentEditable = "true";
  div.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;";
  div.innerHTML = html;
  document.body.appendChild(div);

  try {
    div.focus();
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    const success = document.execCommand("copy");
    sel.removeAllRanges();
    return success;
  } finally {
    document.body.removeChild(div);
  }
}

export async function copyToClipboard(text: string, html?: string): Promise<void> {
  // ClipboardItem が使える環境では HTML + プレーンテキストの両形式で書き込む
  if (html && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch (e) {
      // ClipboardItem が失敗（transient activation 切れ等）→ execCommand 方式を試みる
      console.warn("[CopyChatGPT] ClipboardItem 失敗:", e);
    }
  }

  // contenteditable + execCommand でHTML形式コピー（ClipboardItem の代替）
  if (html && copyHtmlViaExecCommand(html)) {
    console.log("[CopyChatGPT] execCommand コピー成功");
    return;
  }

  // プレーンテキストのみ
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // フォールバック: execCommand（古い環境向け）
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!success) {
      throw new Error("クリップボードへのコピーに失敗しました");
    }
  }
}
