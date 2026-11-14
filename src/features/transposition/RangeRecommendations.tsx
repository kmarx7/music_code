"use client";

import { useMemo, useRef, useState } from "react";
import { analyzeScoreRange, recommendTranspositions } from "@/domain/score";
import type { RangeAnalysis, RangeRecommendation, Score, TargetMidiRange } from "@/domain/score";
import { formatNoteLabel, isPitchInMidiRange, KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { midiToPitch } from "@/features/piano-input";

const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
export function RangeSummary({ analysis }: { analysis: RangeAnalysis }) {
  return <p data-testid="score-range">{analysis.empty ? "전체 음역: 음표 없음" :
    `전체 음역: ${analysis.lowestName} (MIDI ${analysis.minMidi}) ~ ${analysis.highestName} (MIDI ${analysis.maxMidi}) · ${analysis.spanSemitones}반음`}
    {` · 표기 음표 ${analysis.noteEventCount}개 / 논리적 발음 ${analysis.logicalNoteCount}개 · 모든 파트 기준`}</p>;
}
function targetName(text: string) {
  const midi = Number(text);
  return text.trim() && isPitchInMidiRange(midi) ? formatNoteLabel(midiToPitch(midi), "letter") : "유효한 MIDI를 입력하세요";
}

/** Component-lifetime request only: no store/command/repository access. */
export function RangeRecommendations({ score, disabled, onPreview, onInvalidate, initialTarget, targetLabel }: {
  score: Score; disabled: boolean; onPreview: (candidate: RangeRecommendation) => void; onInvalidate: () => void;
  /** Starts with this target already calculated (악기에 맞추기, B-3). Remount the component to change it. */
  initialTarget?: TargetMidiRange; targetLabel?: string;
}) {
  const analysis = useMemo(() => analyzeScoreRange(score), [score]);
  const [low, setLow] = useState(String(initialTarget?.minMidi ?? analysis.minMidi ?? 0));
  const [high, setHigh] = useState(String(initialTarget?.maxMidi ?? analysis.maxMidi ?? 127));
  const [target, setTarget] = useState<TargetMidiRange | null>(initialTarget ?? null);
  const [error, setError] = useState("");
  const activeTarget = useRef<TargetMidiRange | null>(initialTarget ?? null);
  const result = useMemo(() => target ? recommendTranspositions(score, target) : null, [score, target]);
  const fits = result?.ok ? result.candidates.filter((candidate) => candidate.fits) : [];
  const shown = result?.ok ? (fits.length ? fits.slice(0, 8) : result.candidates.slice(0, 5)) : [];
  function invalidate() { activeTarget.current = null; setTarget(null); setError(""); onInvalidate(); }
  return <section aria-label="음역 기반 조옮김 추천" style={{ padding: 12, border: "1px solid #d9dee8", borderRadius: 8, marginTop: 12 }}>
    <h3 style={{ fontSize: 16 }}>목표 음역과 조옮김 추천</h3>
    {targetLabel && target === initialTarget ? <p data-testid="range-target-source">{targetLabel}</p> : null}
    <form onSubmit={(event) => {
      event.preventDefault(); if (disabled) return;
      if (!low.trim() || !high.trim()) { setError("목표 최저·최고 MIDI를 모두 입력해 주세요."); return; }
      const requested = { minMidi: Number(low), maxMidi: Number(high) };
      // An unchanged request keeps the same target object: a repeated or double click never recomputes (H-03).
      const next = target && target.minMidi === requested.minMidi && target.maxMidi === requested.maxMidi ? target : requested;
      activeTarget.current = next; setError(""); setTarget(next);
    }} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <label>목표 최저 MIDI <input aria-label="목표 최저 MIDI" type="number" min={0} max={127} step={1} required value={low}
        onChange={(event) => { setLow(event.target.value); invalidate(); }} style={{ width: 80, minHeight: 44 }} /> {targetName(low)}</label>
      <label>목표 최고 MIDI <input aria-label="목표 최고 MIDI" type="number" min={0} max={127} step={1} required value={high}
        onChange={(event) => { setHigh(event.target.value); invalidate(); }} style={{ width: 80, minHeight: 44 }} /> {targetName(high)}</label>
      <button type="submit" disabled={disabled || analysis.empty} style={{ minHeight: 44 }}>추천 계산</button>
    </form>
    <p style={{ fontSize: 12 }}>전체 파트에 같은 목표 음역을 적용합니다. 목표 MIDI 이름은 기본 샵 표기이며 후보 철자는 기존 엔진을 따릅니다.
      수치상 적합성으로 실제 악기의 연주 가능성을 판단하지 않습니다.</p>
    {analysis.empty ? <p>음표가 없어 추천할 수 없습니다.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {result && !result.ok ? <p role="alert">{result.error.message}</p> : null}
    {result?.ok && !result.analysis.empty ? <>
      <p data-testid="range-recommendation-summary">{fits.length ? `목표 음역 전체 적합 ${fits.length}개 · 상위 ${shown.length}개 표시`
        : "목표 음역에 완전히 들어가는 유효 후보가 없습니다. 부분 적합 후보를 별도로 표시합니다."}</p>
      <p style={{ fontSize: 12 }}>순위: 전체 적합 → 절대 반음 이동 최소 → 동률 상행 → 기존 엔진 자동 철자 → 지원 조성 고정 순서.
        지원 조성·방향과 -127~+127반음을 검사하며 옥타브 이동을 포함합니다.</p>
      <ol>{shown.map((candidate, index) => <li key={candidate.id} data-testid="range-candidate" data-fit={candidate.fits ? "full" : "partial"}>
        <p>{KEY_SIGNATURE_OPTIONS.find((option) => option.key.mode === candidate.targetKey.mode && option.key.fifths === candidate.targetKey.fifths)?.label}
          {` · ${signed(candidate.interval.deltaSemitones)}반음 · ${candidate.analysis.lowestName} (MIDI ${candidate.analysis.minMidi}) ~ ${candidate.analysis.highestName} (MIDI ${candidate.analysis.maxMidi}) · ${candidate.fits ? "전체 적합" : "부분 적합"}`}</p>
        {!candidate.fits ? <details><summary>{`범위 밖 발음 ${candidate.violations.length}개 · 아래 ${candidate.belowSemitones} / 위 ${candidate.aboveSemitones}반음 초과`}</summary>
          <ul>{candidate.violations.map((note) => <li key={`${note.partId}:${note.eventId}`}>{`${score.parts.find((part) => part.id === note.partId)?.name ?? "파트"} · ${note.name} (MIDI ${note.midi}) · ${note.side === "below" ? "낮음" : "높음"} ${note.excessSemitones}반음`}</li>)}</ul>
        </details> : null}
        <button type="button" disabled={disabled} onClick={() => { if (!disabled && target && activeTarget.current === target) onPreview(candidate); }} style={{ minHeight: 44 }}
          aria-label={`${index + 1}순위 ${signed(candidate.interval.deltaSemitones)}반음 후보 미리보기`}>후보 미리보기</button>
      </li>)}</ol>
      {result.rejected.length ? <details><summary>표기·음역 조건으로 제외된 이동</summary>
        <ul>{[...new Set(result.rejected.map((item) => item.error.message))].map((message) => <li key={message}>{message}</li>)}</ul>
      </details> : null}
    </> : null}
  </section>;
}
