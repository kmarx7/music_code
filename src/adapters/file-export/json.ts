import { downloadFile } from "./download";

/** JSON 백업 다운로드. Score 검증/직렬화는 Application에서 수행한다. */
export function downloadScoreJson(backup: { json: string; filename: string }): void {
  downloadFile({ data: backup.json, filename: backup.filename, mimeType: "application/json;charset=utf-8" });
}
