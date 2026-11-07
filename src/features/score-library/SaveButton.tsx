"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { AutosaveHandle, SaveStatus } from "./useAutosave";

/** Manual entry point to the existing autosave queue; never owns a Score or repository. */
export function SaveButton({ autosave, status }: {
  autosave: RefObject<AutosaveHandle | null>; status: SaveStatus;
}) {
  const [saving, setSaving] = useState(false);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function save() {
    if (pending.current) return;
    pending.current = true; setSaving(true); setRequested(true); setFailed(false);
    try {
      const saved = await autosave.current?.flush();
      if (active.current) setFailed(!saved);
    } catch {
      if (active.current) setFailed(true);
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  }
  const error = status === "error" || failed;
  const feedback = saving || (requested && status === "saving") ? "최신 편집 내용을 저장 중입니다."
    : error ? "악보를 저장하지 못했습니다. 저장 버튼을 눌러 다시 시도하거나 JSON 백업을 다운로드해 주세요."
    : requested && status === "saved" ? "최신 악보 저장이 완료되었습니다." : "";
  return <div aria-label="악보 저장" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
    <button type="button" disabled={saving} aria-busy={saving} onClick={() => { void save(); }}
      style={{ padding: "8px 16px", minHeight: 44, border: "1px solid #c8cfdb", borderRadius: 8, background: "#ffffff", cursor: "pointer" }}>저장</button>
    <span data-testid="manual-save-feedback" aria-live="polite" style={{ fontSize: 13, color: error ? "#b91c1c" : "#5f6773" }}>{feedback}</span>
  </div>;
}
