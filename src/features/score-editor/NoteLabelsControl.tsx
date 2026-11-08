"use client";

import type { NoteLabelMode } from "@/domain/music-theory";

/** Controlled local display preference, with no command or repository dependency. */
export function NoteLabelsControl({ mode, onChange }: {
  mode: NoteLabelMode; onChange: (mode: NoteLabelMode) => void;
}) {
  return <label>악보 라벨 <select aria-label="악보 라벨" value={mode} style={{ minHeight: 44 }} onChange={(event) => {
    const value = event.target.value;
    if (value === "none" || value === "letter" || value === "fixed-do") onChange(value);
  }}>
    <option value="none">표시 안 함</option>
    <option value="letter">음이름</option>
    <option value="fixed-do">계이름</option>
  </select></label>;
}
