/** 브라우저 파일 다운로드만 담당한다. Score 검증/직렬화는 Application에서 수행한다. */
export function downloadScoreJson(backup: { json: string; filename: string }): void {
  const url = URL.createObjectURL(new Blob([backup.json], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = backup.filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
