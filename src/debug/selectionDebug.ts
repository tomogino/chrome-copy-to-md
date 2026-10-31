/**
 * Copy Selection の開発用デバッグ出力。
 *
 * 有効化: Popup を右クリック →「検証」で開いた DevTools コンソールで
 *   localStorage.setItem("ccg:debug", "1")
 * 無効化:
 *   localStorage.removeItem("ccg:debug")
 *
 * 出力先は Popup の DevTools コンソールのみ。外部送信・恒久保存は行わない
 * （localStorage に保存するのは有効/無効フラグだけ）。
 */

const DEBUG_KEY = "ccg:debug";

export function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

export function logSelectionDebug(
  extractedHtml: string,
  stages: [string, string][],
  clipboardHtml: string
): void {
  console.groupCollapsed("[CopyChatGPT] Copy Selection debug");
  console.log("1. Extracted HTML\n" + extractedHtml);
  console.groupCollapsed("2. Markdown stages");
  for (const [stage, value] of stages) {
    console.log(`${stage}\n${value}`);
  }
  console.groupEnd();
  console.log("2. Normalized Markdown (text/plain)\n" + (stages[stages.length - 1]?.[1].trim() ?? ""));
  console.log("3. Clipboard HTML (text/html)\n" + clipboardHtml);
  console.groupEnd();
}
