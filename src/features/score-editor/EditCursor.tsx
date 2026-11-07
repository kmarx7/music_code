"use client";

import { useState } from "react";
import type { Part } from "@/domain/score";
import { measureTicks, TICKS_PER_QUARTER } from "@/domain/score";
import { noteInputTick } from "@/application";

/** null selects the existing append mode; a number is an absolute UI tick. */
export function EditCursor({ part, tick, onChange }: {
  part: Part; tick: number | null; onChange: (tick: number | null) => void;
}) {
  const [error, setError] = useState("");
  const length = measureTicks(part.timeSignature);
  const total = length * part.measures.length;
  const measure = tick === null ? 1 : Math.floor(tick / length) + 1;
  const beat = tick === null ? 1 : (tick % length) / (TICKS_PER_QUARTER * 4 / part.timeSignature.denominator) + 1;
  return <section aria-label="편집 커서" style={{ border: "1px solid #d9dee8", borderRadius: 8, padding: 12, marginBottom: 16 }}>
    <label>입력 위치 <select aria-label="입력 위치" value={tick === null ? "append" : "cursor"}
      onChange={(event) => { setError(""); onChange(event.target.value === "append" ? null : 0); }}>
      <option value="append">악보 끝에 입력</option><option value="cursor">편집 커서에 입력</option>
    </select></label>
    <p data-testid="edit-cursor-position" data-tick={tick ?? "append"} style={{ margin: "8px 0" }}>
      {tick === null ? "입력 위치: 마지막 이벤트 뒤" : tick >= total
        ? `편집 커서: 악보 끝 또는 범위 밖 · ${tick} ticks — 마디를 추가하거나 위치를 선택하세요.`
        : `편집 커서: ${measure}마디 ${beat}박 · ${tick} ticks`}
    </p>
    {tick !== null && <form key={`${part.timeSignature.numerator}/${part.timeSignature.denominator}:${part.measures.length}:${tick}`}
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }} onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const next = noteInputTick(part, Number(values.get("measure")), Number(values.get("beat")));
        if (next === null) { setError("유효한 마디와 마디 안 박 위치를 입력해 주세요. 위치는 정수 tick이어야 합니다."); return; }
        setError(""); onChange(next);
      }}>
      <label>커서 마디 <input name="measure" type="number" min={1} max={part.measures.length} required
        defaultValue={Math.min(measure, part.measures.length)} style={{ width: 70 }} /></label>
      <label>커서 박 <input name="beat" type="number" min={1} step="any" required
        defaultValue={beat} style={{ width: 80 }} /></label>
      <button type="submit">커서 이동</button>
    </form>}
    {error && <p data-testid="edit-cursor-error" aria-live="polite">{error}</p>}
    <p style={{ fontSize: 12, marginBottom: 0 }}>박은 분모 음가 기준으로 1부터 셉니다. 커서 입력은 빈 구간에만 가능하며 기존 음표·쉼표를 밀어내지 않습니다. 쉼표 삽입은 기존 끝 입력을 유지합니다.</p>
  </section>;
}
