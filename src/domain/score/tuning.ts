import type { Part, Score } from "./types";
import { getInstrumentProfile, instrumentOf, type InstrumentTuning } from "./instruments";

/*
 * 조율 추천과 "누름" 판정 (Phase 7 B-4, decision 8). Read-only: the result is a display overlay, never stored
 * (master plan: "누름 필요" 표시는 Score·JSON·저장 이력에 넣지 않는다). B-1 answer G3: any note off the open strings is
 * shown as 누름, whatever the bend width; none is called unplayable.
 */

export interface TuningRecommendation {
  readonly tuning: InstrumentTuning;
  /** Attacks (tie continuations once) that are not an open string in this tuning. */
  readonly pressed: number;
  /** The tuning is the scale of the score's key signature. */
  readonly keyMatch: boolean;
}

/** Event ids of the attacks that need a press in this tuning. A tie continuation is the same pluck, so it is not marked. */
export function pressedNoteIds(part: Part, tuning: InstrumentTuning): ReadonlySet<string> {
  const open = new Set(tuning.stringMidis);
  const continuations = new Set(part.ties.map((tie) => tie.to));
  const pressed = new Set<string>();
  for (const measure of part.measures) for (const event of measure.events) {
    if (event.kind === "note" && !continuations.has(event.id) && !open.has(event.pitch.midi)) pressed.add(event.id);
  }
  return pressed;
}

/** The first part's instrument tunings, fewest presses first, then the key's own tuning, then profile order. */
export function recommendTunings(score: Score): readonly TuningRecommendation[] {
  const part = score.parts[0];
  if (!part) return [];
  const profile = getInstrumentProfile(instrumentOf(part));
  if (!profile.verified) return [];
  return profile.tunings
    .map((tuning, order) => ({ tuning, order, keyMatch: tuning.keyFifths === part.keySignature.fifths,
      pressed: score.parts.reduce((sum, candidate) => sum + pressedNoteIds(candidate, tuning).size, 0) }))
    .sort((a, b) => a.pressed - b.pressed || Number(b.keyMatch) - Number(a.keyMatch) || a.order - b.order)
    .map(({ tuning, pressed, keyMatch }) => ({ tuning, pressed, keyMatch }));
}
