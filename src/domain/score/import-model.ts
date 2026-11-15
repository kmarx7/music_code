import type { DiatonicStep } from "./types";

/*
 * Neutral model of a score read from a file (Phase 8 step 1). It is not a Score: ticks are at 960 per quarter
 * and may be fractional, notes keep their staff/voice/chord flags, and nothing is quantized yet.
 * extractMelody turns it into a monophonic Score.
 */

export interface ImportedPitch { step: DiatonicStep; alter: number; octave: number }

export interface ImportedNote {
  measureNumber: string;
  /** Ticks at 960 per quarter; may be fractional. */
  startTick: number;
  durationTicks: number;
  /** null = rest. */
  pitch: ImportedPitch | null;
  staff: number;
  voice: string;
  chord: boolean;
  grace: boolean;
  cue: boolean;
  tieStart: boolean;
  tieStop: boolean;
}

export interface ImportedMeasure { number: string; startTick: number; lengthTicks: number; implicit: boolean }

export interface ImportedTimeSignature { tick: number; numerator: number; denominator: number }
export interface ImportedKey { tick: number; fifths: number; mode: string | null; nonStandard: boolean }
export interface ImportedTempo { tick: number; bpm: number }

export interface ImportedPart {
  id: string;
  name: string;
  staves: number;
  notes: ImportedNote[];
  measures: ImportedMeasure[];
  timeSignatures: ImportedTimeSignature[];
  keys: ImportedKey[];
}

export interface ImportedScore {
  title: string | null;
  tempos: ImportedTempo[];
  parts: ImportedPart[];
  /** Marks the import does not carry over: repeats/endings, lyrics, and directions (dynamics, articulations, chord symbols…). */
  ignored: { repeats: number; lyrics: number; directions: number };
}
