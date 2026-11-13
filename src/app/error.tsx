"use client";

import Link from "next/link";
import { useState } from "react";
import { exportScoreBackup } from "@/application";
import { downloadScoreJson } from "@/adapters/file-export/json";
import { scoreStore } from "@/store/score-store";

const page: React.CSSProperties = {
  maxWidth: 640, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6, wordBreak: "keep-all",
  fontFamily: "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif",
};
const button: React.CSSProperties = { minHeight: 44, padding: "8px 14px", borderRadius: 8, border: "1px solid #1b2a4a", background: "#ffffff", color: "#1b2a4a", cursor: "pointer" };

/**
 * Screen-level error boundary (P6-05). The canonical Score lives in scoreStore, outside React, so an editing
 * session survives a render crash and can still be downloaded before anything else is tried.
 */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [note, setNote] = useState("");
  const current = scoreStore.getState()?.current ?? null;
  function backup() {
    if (!current) return;
    try { downloadScoreJson(exportScoreBackup(current)); setNote("현재 편집 내용을 JSON으로 내려받았습니다."); }
    catch { setNote("JSON 백업을 만들지 못했습니다."); }
  }
  return (
    <main style={page} data-testid="error-screen">
      <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>화면을 표시하는 중 문제가 생겼습니다</h1>
      <p>저장된 악보는 바뀌지 않았습니다.{current ? " 편집 중이던 내용은 아래에서 JSON으로 먼저 받아 둘 수 있습니다." : ""}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
        {current ? <button type="button" style={{ ...button, background: "#1b2a4a", color: "#ffffff" }} onClick={backup}>현재 내용 JSON 백업</button> : null}
        <button type="button" style={button} onClick={reset}>다시 시도</button>
        <Link href="/" style={{ ...button, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>홈으로</Link>
      </div>
      {note ? <p role="status">{note}</p> : null}
      {error.digest ? <p style={{ fontSize: 12, color: "#5f6773" }}>오류 번호: {error.digest}</p> : null}
    </main>
  );
}
