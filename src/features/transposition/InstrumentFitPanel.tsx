"use client";

import { useMemo, useState } from "react";
import {
  analyzeInstrumentFit, getInstrumentProfile, INSTRUMENT_IDS, instrumentOf, isInstrumentId, selectableInstruments,
} from "@/domain/score";
import type { Score, TargetMidiRange, TuningRecommendation } from "@/domain/score";
import { scoreStore } from "@/store/score-store";
import { RefineSection } from "@/features/score-editor";

const button = { padding: "8px 14px", minHeight: 44, border: "1px solid #c8cfdb", borderRadius: 8, background: "#fff", cursor: "pointer" };
const CLEF_NAMES = { treble: "높은음자리표", bass: "낮은음자리표" } as const;

export interface InstrumentFitPanelProps {
  score: Score;
  disabled: boolean;
  /** Opens the transposition preview with this range already calculated. Notes change only on its 확정. */
  onRecommend: (target: TargetMidiRange, label: string) => void;
  /** The instrument's tunings, recommended first (B-4). The choice is view state; it changes no note. */
  tunings?: readonly TuningRecommendation[];
  tuningId?: string | null;
  onTuningChange?: (id: string) => void;
}

/**
 * 악기에 맞추기 (Phase 7 B-3, decision 7). Choosing an instrument and applying a suggested clef are single commands
 * (one Undo each); neither moves a note. Unconfirmed instruments are listed as "준비 중" and cannot be chosen.
 */
export function InstrumentFitPanel({ score, disabled, onRecommend, tunings = [], tuningId = null, onTuningChange }: InstrumentFitPanelProps) {
  const part = score.parts[0];
  const current = instrumentOf(part);
  const profile = getInstrumentProfile(current);
  const fit = useMemo(() => analyzeInstrumentFit(score, current), [score, current]);
  const [error, setError] = useState("");
  const selectable = new Set(selectableInstruments().map((candidate) => candidate.id));

  function dispatch(command: Parameters<typeof scoreStore.dispatch>[0]) {
    const result = scoreStore.dispatch(command);
    setError(result && !result.ok ? result.error.message : "");
  }

  const summary = !fit.range ? "음역 자료 준비 중"
    : fit.logicalNoteCount === 0 ? "음표 없음"
    : fit.outside.total === 0 ? "모두 음역 안" : `범위 밖 ${fit.outside.total}개`;
  return (
    <RefineSection title="악기에 맞추기" summary={`${profile.name} · ${summary}`}>
      <fieldset style={{ border: "1px solid #d9dee8", borderRadius: 10, padding: 16, margin: "0 0 16px", minWidth: 0 }}>
        <legend>악기에 맞추기</legend>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>악기
            <select aria-label="악기" value={current} disabled={disabled} style={{ minHeight: 44, maxWidth: "100%" }}
              onChange={(event) => {
                const value = event.target.value;
                if (!isInstrumentId(value) || value === current || !selectable.has(value)) return;
                dispatch({ type: "SetInstrument", partId: part.id, instrument: value, updatedAt: new Date().toISOString() });
              }}>
              {INSTRUMENT_IDS.map((id) => {
                const candidate = getInstrumentProfile(id);
                const ready = selectable.has(id);
                return <option key={id} value={id} disabled={!ready}>{ready ? candidate.name : `${candidate.name} (준비 중)`}</option>;
              })}
            </select>
          </label>
          <p data-testid="instrument-fit-summary" style={{ margin: 0 }}>{!fit.range || !profile.range
            ? "이 악기의 음역 자료를 확인하는 중이라 음역 비교를 할 수 없습니다."
            : fit.logicalNoteCount === 0 ? `음역 ${profile.range.label} · 음표가 없습니다.`
            : fit.outside.total === 0 ? `음역 ${profile.range.label} · 모든 음이 음역 안에 있습니다.`
            : `음역 ${profile.range.label} · 범위 밖 음 ${fit.outside.total}개 (낮음 ${fit.outside.below} · 높음 ${fit.outside.above})`}</p>
          {profile.grandStaff ? <p style={{ margin: 0 }}>이 악기는 큰보표(높은음자리표와 낮은음자리표 함께)로 표시합니다.</p>
            : fit.suggestedClef && fit.suggestedClef !== part.clef ? <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span data-testid="clef-suggestion">{`권장 음자리표: ${CLEF_NAMES[fit.suggestedClef]} (현재 ${CLEF_NAMES[part.clef]})`}</span>
              <button type="button" style={button} disabled={disabled}
                onClick={() => dispatch({ type: "SetClef", partId: part.id, clef: fit.suggestedClef!, updatedAt: new Date().toISOString() })}>
                {`${CLEF_NAMES[fit.suggestedClef]} 적용`}</button>
            </p> : null}
          {tunings.length > 0 ? <TuningChoice tunings={tunings} tuningId={tuningId} onChange={onTuningChange} /> : null}
          <div>
            <button type="button" style={button} disabled={disabled || !fit.range || fit.logicalNoteCount === 0}
              onClick={() => { if (fit.range && profile.range) onRecommend(fit.range, `${profile.name} 음역 ${profile.range.label}으로 계산했습니다.`); }}>
              이 악기 음역으로 조옮김 추천</button>
          </div>
          <p style={{ margin: 0, fontSize: 12 }}>악기나 음자리표를 바꿔도 음은 그대로입니다. 조옮김은 후보를 미리 본 뒤 확정할 때만 적용되며, 각각 실행 취소 한 번으로 되돌립니다.
            음역 안에 들어와도 실제 연주 가능 여부는 연주자 확인이 필요합니다.</p>
          {error ? <p role="alert" style={{ margin: 0 }}>{error}</p> : null}
        </div>
      </fieldset>
    </RefineSection>
  );
}

function pressText(count: number): string {
  return count === 0 ? "누름 없음" : `누름 ${count}개`;
}

/** 조율 선택 (B-4, decision 8). Off-tuning notes are all marked "누름" on the staff and in print, never "불가" (B-1 G3). */
function TuningChoice({ tunings, tuningId, onChange }: {
  tunings: readonly TuningRecommendation[]; tuningId: string | null; onChange?: (id: string) => void;
}) {
  const active = tunings.find((entry) => entry.tuning.id === tuningId) ?? tunings[0];
  const recommended = tunings[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {tunings.length > 1 ? <label style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>조율
        <select aria-label="조율" value={active.tuning.id} style={{ minHeight: 44, maxWidth: "100%" }}
          onChange={(event) => onChange?.(event.target.value)}>
          {tunings.map((entry) => <option key={entry.tuning.id} value={entry.tuning.id}>
            {`${entry.tuning.name} · ${pressText(entry.pressed)}${entry === recommended ? " (추천)" : ""}`}</option>)}
        </select>
      </label> : null}
      <p data-testid="tuning-summary" style={{ margin: 0 }}>{`조율: ${active.tuning.name} · ${pressText(active.pressed)}`
        + (active.pressed > 0 ? " — 조율에 없는 음은 악보에 \"누름\"으로 표시합니다." : "")}</p>
      {tunings.length > 1 && active !== recommended ? <p style={{ margin: 0, fontSize: 12 }}>
        {`추천은 ${recommended.tuning.name}(${pressText(recommended.pressed)})입니다.`}</p> : null}
      <p style={{ margin: 0, fontSize: 12 }}>조율은 화면·인쇄 표시용이며 악보에 저장되지 않습니다.</p>
    </div>
  );
}
