/** 브라우저 파일 다운로드만 담당한다. 형식 생성·검증은 Application과 형식별 adapter가 맡는다. */
export function downloadFile(file: { data: Uint8Array | string; filename: string; mimeType: string }): void {
  const part: BlobPart = typeof file.data === "string" ? file.data : new Uint8Array(file.data);
  const url = URL.createObjectURL(new Blob([part], { type: file.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
