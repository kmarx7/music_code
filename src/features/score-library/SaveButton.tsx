"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { AutosaveHandle, SaveStatus } from "./useAutosave";

/** Manual entry point to the existing autosave queue; never owns a Score or repository. */
export function SaveButton({ autosave, status }: {
  autosave: RefObject<AutosaveHandle | null>; status: SaveStatus;
}) {
  const [saving, setSaving] = useState(false);
  const [requested, setRequested] = useState(false);
  // Only invocation errors live here; persistent storage outcomes belong to useAutosave.
  const [failed, setFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function save() {
    if (pending.current) return;
    pending.current = true; setSaving(true); setRequested(true); setFailed(false); setUnavailable(false);
    try {
      if (!autosave.current) { if (active.current) setUnavailable(true); return; }
      await autosave.current.flush();
    } catch {
      if (active.current) setFailed(true);
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  }
  const blocked = status === "conflict" || status === "deleted";
  const error = status === "error" || unavailable || (failed && status !== "saved");
  const feedback = saving || (requested && status === "saving") ? "최신 편집 내용을 저장 중입니다."
    : blocked ? "다른 탭의 변경 또는 삭제로 저장이 중단되었습니다. 현재 내용을 JSON 백업하거나 새 악보로 저장해 주세요."
    : error ? "악보를 저장하지 못했습니다. 저장 버튼을 눌러 다시 시도하거나 JSON 백업을 다운로드해 주세요. 문제가 계속되면 이전 탭에서 백업 후 닫고 최신 페이지를 다시 열어 주세요."
    : requested && status === "saved" ? "최신 악보 저장이 완료되었습니다." : "";
  return <div aria-label="악보 저장" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
    <button type="button" disabled={saving || blocked} aria-busy={saving} onClick={() => { void save(); }}
      style={{ padding: "8px 16px", minHeight: 44, border: "1px solid #c8cfdb", borderRadius: 8, background: "#ffffff", cursor: "pointer" }}>저장</button>
    <span data-testid="manual-save-feedback" aria-live="polite" style={{ fontSize: 13, color: error ? "#b91c1c" : "#5f6773" }}>{feedback}</span>
  </div>;
}
