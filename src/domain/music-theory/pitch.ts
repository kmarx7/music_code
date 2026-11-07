import type { DiatonicStep, Pitch } from "@/domain/score/types";
import { MAX_ALTER, MIDI_MAX, MIDI_MIN } from "@/domain/score/constants";

export const DIATONIC_STEPS: readonly DiatonicStep[] = [
  "C",
  "D",
  "E",
  "F",
  "G",
  "A",
  "B",
];

const NATURAL_SEMITONES: Record<DiatonicStep, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const FIXED_DO: Record<DiatonicStep, string> = {
  C: "도",
  D: "레",
  E: "미",
  F: "파",
  G: "솔",
  A: "라",
  B: "시",
};

export function isDiatonicStep(value: string): value is DiatonicStep {
  return (DIATONIC_STEPS as readonly string[]).includes(value);
}

export function midiFromSpelling(
  step: DiatonicStep,
  alter: number,
  octave: number,
): number {
  return (octave + 1) * 12 + NATURAL_SEMITONES[step] + alter;
}

export function isPitchInMidiRange(midi: number): boolean {
  return Number.isInteger(midi) && midi >= MIDI_MIN && midi <= MIDI_MAX;
}

export function isAlterInRange(alter: number): boolean {
  return Number.isInteger(alter) && Math.abs(alter) <= MAX_ALTER;
}

function accidentalGlyph(alter: number): string {
  if (alter > 0) return "#".repeat(alter);
  if (alter < 0) return "b".repeat(-alter);
  return "";
}

export function letterName(pitch: Pitch): string {
  return `${pitch.step}${accidentalGlyph(pitch.alter)}${pitch.octave}`;
}

export function koreanFixedDo(pitch: Pitch): string {
  return `${FIXED_DO[pitch.step]}${accidentalGlyph(pitch.alter)}`;
}

export function createPitch(
  step: DiatonicStep,
  alter: number,
  octave: number,
): Pitch {
  return {
    midi: midiFromSpelling(step, alter, octave),
    step,
    alter,
    octave,
  };
}
