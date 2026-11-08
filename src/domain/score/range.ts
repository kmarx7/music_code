import type { Part, Pitch, Score } from "./types";
import { formatNoteLabel } from "../music-theory/note-label";

export interface PitchRange {
  readonly empty: boolean;
  readonly minMidi: number | null;
  readonly maxMidi: number | null;
  readonly lowest: Readonly<Pitch> | null;
  readonly highest: Readonly<Pitch> | null;
  readonly lowestName: string | null;
  readonly highestName: string | null;
  readonly spanSemitones: number | null;
  readonly noteEventCount: number;
  readonly logicalNoteCount: number;
}
export interface RangeAnalysis extends PitchRange {
  readonly parts: readonly (PitchRange & { readonly partId: string })[];
}

function rangeOf(parts: readonly Part[]): PitchRange {
  let lowest: Pitch | null = null; let highest: Pitch | null = null;
  let noteEventCount = 0; let logicalNoteCount = 0;
  for (const part of parts) {
    const continuations = new Set(part.ties.map((tie) => tie.to));
    for (const measure of part.measures) for (const event of measure.events) {
      if (event.kind !== "note") continue;
      noteEventCount++; if (!continuations.has(event.id)) logicalNoteCount++;
      // Equal MIDI retains the first spelling encountered in canonical Score order.
      if (!lowest || event.pitch.midi < lowest.midi) lowest = event.pitch;
      if (!highest || event.pitch.midi > highest.midi) highest = event.pitch;
    }
  }
  return { empty: noteEventCount === 0, minMidi: lowest?.midi ?? null, maxMidi: highest?.midi ?? null,
    lowest: lowest ? { ...lowest } : null, highest: highest ? { ...highest } : null,
    lowestName: lowest ? formatNoteLabel(lowest, "letter") : null,
    highestName: highest ? formatNoteLabel(highest, "letter") : null,
    spanSemitones: lowest && highest ? highest.midi - lowest.midi : null, noteEventCount, logicalNoteCount };
}

/** Read-only projection of canonical pitches. Input validity remains the edit/import boundary's responsibility. */
export function analyzeScoreRange(score: Score): RangeAnalysis {
  return { ...rangeOf(score.parts), parts: score.parts.map((part) => ({ partId: part.id, ...rangeOf([part]) })) };
}
