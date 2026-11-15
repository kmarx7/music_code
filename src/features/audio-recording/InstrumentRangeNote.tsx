"use client";

import { useMemo } from "react";
import { analyzeInstrumentFit, getInstrumentProfile, instrumentOf, recommendTranspositions } from "@/domain/score";
import type { Score } from "@/domain/score";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";

/**
 * `/record` step ④ (B-6): how the take sits in the chosen instrument's range, with the existing recommender's best
 * move. Display only: nothing is transposed here; the editor's 다듬기 → 악기에 맞추기 previews and confirms it.
 */
export function InstrumentRangeNote({ score }: { score: Score }) {
  const part = score.parts[0];
  const instrument = part ? instrumentOf(part) : "piano";
  const profile = getInstrumentProfile(instrument);
  const fit = useMemo(() => analyzeInstrumentFit(score, instrument), [score, instrument]);
  const best = useMemo(() => {
    if (!fit.range || fit.outside.total === 0) return null;
    const result = recommendTranspositions(score, fit.range);
    return result.ok ? result.candidates[0] ?? null : null;
  }, [score, fit]);
  if (!fit.range || !profile.range || fit.logicalNoteCount === 0) return null;
  const keyName = best ? KEY_SIGNATURE_OPTIONS.find((option) => option.key.mode === best.targetKey.mode
    && option.key.fifths === best.targetKey.fifths)?.label : null;
  const shift = best ? `${best.interval.deltaSemitones > 0 ? "+" : ""}${best.interval.deltaSemitones}반음` : "";
  return (
    <div data-testid="record-instrument-range" style={{ margin: "12px 0 0" }}>
      <p style={{ margin: 0 }}>{fit.outside.total === 0
        ? `${profile.name} 음역 ${profile.range.label} · 모든 음이 음역 안에 있습니다.`
        : `${profile.name} 음역 ${profile.range.label} · 범위 밖 음 ${fit.outside.total}개 (낮음 ${fit.outside.below} · 높음 ${fit.outside.above})`}</p>
      {best ? <p data-testid="record-instrument-recommendation" className="hb-muted" style={{ margin: "4px 0 0" }}>
        {best.fits ? `추천: ${shift} 이동${keyName ? `(${keyName})` : ""} · 모든 음이 음역 안에 들어옵니다.`
          : `모두 들어가는 이동은 없습니다. 가장 가까운 후보: ${shift} 이동${keyName ? `(${keyName})` : ""}.`}
        {" "}악보를 만든 뒤 다듬기 → 악기에 맞추기에서 미리 보고 확정할 수 있습니다. 지금은 음을 바꾸지 않습니다.</p> : null}
    </div>
  );
}
