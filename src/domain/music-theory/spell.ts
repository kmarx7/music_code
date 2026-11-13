import type { DiatonicStep, KeySignature, Pitch } from "@/domain/score/types";
import { createPitch, isPitchInMidiRange } from "./pitch";

const NATURAL: Record<DiatonicStep, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_ORDER: readonly DiatonicStep[] = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER: readonly DiatonicStep[] = ["B", "E", "A", "D", "G", "C", "F"];
const SHARP_SPELLING: readonly [DiatonicStep, number][] = [["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0],
  ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]];
const FLAT_SPELLING: readonly [DiatonicStep, number][] = [["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0],
  ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]];

/**
 * Spells a MIDI number for a key: a note of the key's scale uses the key signature's letter and accidental
 * (Bb in F major, Cb in Gb major, E# in F# major); any other note takes a sharp in sharp and natural keys and a flat in flat keys.
 */
export function spellMidiInKey(midi: number, key: KeySignature): Pitch {
  if (!isPitchInMidiRange(midi)) throw new RangeError(`MIDI number must be an integer within 0–127: ${midi}`);
  const keyAlter = (step: DiatonicStep) =>
    key.fifths > 0 ? (SHARP_ORDER.indexOf(step) < key.fifths ? 1 : 0) : (FLAT_ORDER.indexOf(step) < -key.fifths ? -1 : 0);
  const pitchClass = ((midi % 12) + 12) % 12;
  const diatonic = (Object.keys(NATURAL) as DiatonicStep[])
    .find((step) => (((NATURAL[step] + keyAlter(step)) % 12) + 12) % 12 === pitchClass);
  const [step, alter] = diatonic ? [diatonic, keyAlter(diatonic)] as const
    : (key.fifths < 0 ? FLAT_SPELLING : SHARP_SPELLING)[pitchClass];
  return createPitch(step, alter, (midi - NATURAL[step] - alter) / 12 - 1);
}
