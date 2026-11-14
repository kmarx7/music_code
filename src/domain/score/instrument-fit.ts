import type { Clef, Score } from "./types";
import type { InstrumentId } from "./constants";
import { INSTRUMENT_IDS } from "./constants";
import { getInstrumentProfile, type InstrumentProfile } from "./instruments";
import type { TargetMidiRange } from "./range-recommendations";

/* 악기에 맞추기 (Phase 7 B-3, decision 7). Read-only analysis: it never changes a note. */

export interface InstrumentFit {
  readonly instrument: InstrumentId;
  /** The instrument's sounding range as a recommender target, or null while its values are unconfirmed. */
  readonly range: TargetMidiRange | null;
  /** Logical attacks (tie continuations once) outside the range. */
  readonly outside: { readonly below: number; readonly above: number; readonly total: number };
  readonly logicalNoteCount: number;
  /** A clef to suggest for a one-staff instrument, from the median sounding note; null on a grand staff or with no notes. */
  readonly suggestedClef: Clef | null;
}

/** Instruments the user may choose: confirmed profiles only, in `INSTRUMENT_IDS` order. */
export function selectableInstruments(): readonly InstrumentProfile[] {
  return INSTRUMENT_IDS.map(getInstrumentProfile).filter((profile) => profile.verified && profile.range !== null);
}

export function analyzeInstrumentFit(score: Score, instrument: InstrumentId): InstrumentFit {
  const profile = getInstrumentProfile(instrument);
  const range = profile.verified && profile.range ? { minMidi: profile.range.lowMidi, maxMidi: profile.range.highMidi } : null;
  const pitches: number[] = [];
  for (const part of score.parts) {
    const continuations = new Set(part.ties.map((tie) => tie.to));
    for (const measure of part.measures) for (const event of measure.events) {
      if (event.kind === "note" && !continuations.has(event.id)) pitches.push(event.pitch.midi);
    }
  }
  const below = range ? pitches.filter((midi) => midi < range.minMidi).length : 0;
  const above = range ? pitches.filter((midi) => midi > range.maxMidi).length : 0;
  let suggestedClef: Clef | null = null;
  if (!profile.grandStaff && pitches.length > 0) {
    const sorted = [...pitches].sort((a, b) => a - b);
    // Lower median, so an even split leans to the staff that holds the lower half.
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    suggestedClef = median < 60 ? "bass" : "treble";
  }
  return { instrument, range, outside: { below, above, total: below + above }, logicalNoteCount: pitches.length, suggestedClef };
}
