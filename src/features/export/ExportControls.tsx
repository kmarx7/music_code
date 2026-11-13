"use client";

import { useState } from "react";
import { exportScore, type ExportPort } from "@/application";
import type { NoteLabelMode } from "@/domain/music-theory";
import type { Score } from "@/domain/score/types";
import { downloadFile } from "@/adapters/file-export/download";
import { midiExport } from "@/adapters/midi";
import { musicXmlExport } from "@/adapters/musicxml";

export interface ExportControlsProps {
  score: Score;
  labelMode: NoteLabelMode;
  /** Saves pending edits; the print view reads the stored score, so it opens only after this succeeds. */
  flush: () => Promise<boolean>;
  /** Storage is in conflict or the score was deleted elsewhere: the stored copy is not the one on screen. */
  storageBlocked: boolean;
}

const button: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, border: "1px solid #c8cfdb", background: "#ffffff", cursor: "pointer", fontSize: 13, minHeight: 44,
};

export function printPath(scoreId: string, labelMode: NoteLabelMode): string {
  return `/print/${encodeURIComponent(scoreId)}${labelMode === "none" ? "" : `?labels=${labelMode}`}`;
}

/**
 * MIDI / MusicXML download the score on screen (it is never changed, stored or added to history).
 * PDF opens the print view in a new tab after saving, for the browser's "Save as PDF" (D-03 #1).
 */
export function ExportControls({ score, labelMode, flush, storageBlocked }: ExportControlsProps) {
  const [notice, setNotice] = useState<{ text: string; error: boolean; link?: string } | null>(null);

  function download(port: ExportPort, label: string) {
    const result = exportScore(score, port);
    if (!result.ok) { setNotice({ text: result.issue.message, error: true }); return; }
    downloadFile(result.file);
    setNotice({ text: `${label} 파일(${result.file.filename})을 내려받았습니다.`, error: false });
  }

  async function openPrint() {
    const path = printPath(score.id, labelMode);
    // Opened inside the click so popup blockers allow it; it is pointed at the print view once the save is done.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setNotice({ text: "저장한 뒤 인쇄 화면을 엽니다…", error: false });
    if (!await flush()) {
      tab?.close();
      setNotice({ text: "저장하지 못해 인쇄 화면을 열지 않았습니다. 다시 시도해 주세요.", error: true });
      return;
    }
    if (!tab) { setNotice({ text: "새 창이 차단되었습니다. 아래 링크로 인쇄 화면을 여세요.", error: true, link: path }); return; }
    tab.location.href = path;
    setNotice({ text: "새 탭에서 인쇄 화면을 열었습니다. 인쇄에서 \"PDF로 저장\"을 고르세요.", error: false });
  }

  return (
    <section aria-label="내보내기" data-testid="export-controls" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>내보내기</span>
      <button type="button" style={button} disabled={storageBlocked} onClick={() => void openPrint()}>PDF (인쇄)</button>
      <button type="button" style={button} onClick={() => download(midiExport, "MIDI")}>MIDI</button>
      <button type="button" style={button} onClick={() => download(musicXmlExport, "MusicXML")}>MusicXML</button>
      {storageBlocked ? <span style={{ fontSize: 12, color: "#5f6773" }}>
        저장 충돌·삭제 상태이거나 저장소를 쓸 수 없을 때는 인쇄 화면을 열 수 없습니다. MIDI·MusicXML·JSON은 화면의 현재 내용으로 받을 수 있습니다.
      </span> : null}
      {notice ? <p role={notice.error ? "alert" : "status"} data-testid="export-notice"
        style={{ width: "100%", margin: 0, fontSize: 12, color: notice.error ? "#b91c1c" : "#5f6773" }}>
        {notice.text}{notice.link ? <> <a href={notice.link} target="_blank" rel="noopener">인쇄 화면 열기</a></> : null}
      </p> : null}
    </section>
  );
}
