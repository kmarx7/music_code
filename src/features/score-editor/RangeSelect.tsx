"use client";

import { useState } from "react";
import type { RangeSelection, Score } from "@/domain/score";
import { measureTicks, selectMeasureRange } from "@/domain/score";

interface RangeSelectProps {
  score: Score;
  /** Current selection for this exact score, or null. Owned by the editor as local UI state. */
  selection: RangeSelection | null;
  onChange: (selection: RangeSelection | null) => void;
}

/**
 * Contiguous measure-range selection (P3-06). Read-only projection: it never dispatches a command,
 * and is independent of the single-event selection used by the edit panel.
 */
export function RangeSelect({ score, selection, onChange }: RangeSelectProps) {
  const [error, setError] = useState("");
  const part = score.parts[0];
  const measureCount = part?.measures.length ?? 0;
  const barTicks = part ? measureTicks(part.timeSignature) : 1;
  const first = selection ? selection.startTick / barTicks + 1 : 1;
  const last = selection ? selection.endTick / barTicks : 1;
  return <section aria-label="구간 선택" style={{ border: "1px solid #d9dee8", borderRadius: 8, padding: 12, marginBottom: 16 }}>
    <form style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }} onSubmit={(event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const result = selectMeasureRange(score, Number(values.get("first")), Number(values.get("last")));
      if (!result.ok) { setError(result.message); onChange(null); return; }
      setError(""); onChange(result.selection);
    }}>
      <label>구간 첫 마디 <input name="first" type="number" min={1} max={measureCount} required
        defaultValue={1} style={{ width: 70 }} /></label>
      <label>구간 마지막 마디 <input name="last" type="number" min={1} max={measureCount} required
        defaultValue={1} style={{ width: 70 }} /></label>
      <button type="submit">구간 선택</button>
      <button type="button" disabled={!selection && !error} onClick={() => { setError(""); onChange(null); }}>선택 해제</button>
    </form>
    <p data-testid="range-selection" data-selected={selection ? "on" : "off"}
      data-start-tick={selection?.startTick ?? ""} data-end-tick={selection?.endTick ?? ""}
      data-event-count={selection?.eventIds.length ?? 0} aria-live="polite" style={{ margin: "8px 0 0" }}>
      {selection
        ? `${first}–${last}마디 선택됨 · 음표 ${selection.noteCount}개 · 쉼표 ${selection.restCount}개`
        : "선택한 구간 없음"}
    </p>
    {error && <p data-testid="range-selection-error" aria-live="polite" style={{ margin: "8px 0 0", color: "#b91c1c" }}>{error}</p>}
    <p style={{ fontSize: 12, marginBottom: 0 }}>마디 단위로 선택하며 쉼표와 빈 구간도 포함합니다. 붙임줄로 이어진 음은 전체가 들어와야 합니다. 악보를 편집하거나 Undo/Redo하면 선택이 해제됩니다.</p>
  </section>;
}
