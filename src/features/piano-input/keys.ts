import type { DiatonicStep, Pitch } from "@/domain/score/types";
import { createPitch, isPitchInMidiRange } from "@/domain/music-theory/pitch";

export const PIANO_LOW_MIDI = 21;
export const PIANO_HIGH_MIDI = 108;

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

const PITCH_CLASS_SPELLING: Record<
  number,
  { step: DiatonicStep; alter: number }
> = {
  0: { step: "C", alter: 0 },
  1: { step: "C", alter: 1 },
  2: { step: "D", alter: 0 },
  3: { step: "D", alter: 1 },
  4: { step: "E", alter: 0 },
  5: { step: "F", alter: 0 },
  6: { step: "F", alter: 1 },
  7: { step: "G", alter: 0 },
  8: { step: "G", alter: 1 },
  9: { step: "A", alter: 0 },
  10: { step: "A", alter: 1 },
  11: { step: "B", alter: 0 },
};

export interface PianoKey {
  midi: number;
  isBlack: boolean;
  whiteIndex: number;
}

export function midiToPitch(midi: number): Pitch {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const spelling = PITCH_CLASS_SPELLING[pitchClass];
  return createPitch(spelling.step, spelling.alter, octave);
}

/**
 * 88건반(A0=21 .. C8=108)을 만든다.
 * 흑건의 whiteIndex는 바로 앞 흰건의 인덱스다(배치용).
 */
export function buildPianoKeys(): PianoKey[] {
  const keys: PianoKey[] = [];
  let whiteIndex = -1;

  for (let midi = PIANO_LOW_MIDI; midi <= PIANO_HIGH_MIDI; midi += 1) {
    const isBlack = !WHITE_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
    if (!isBlack) whiteIndex += 1;
    keys.push({ midi, isBlack, whiteIndex });
  }

  return keys;
}

export const COMPUTER_KEY_MAP: Record<
  string,
  { step: DiatonicStep; alter: number }
> = {
  a: { step: "C", alter: 0 },
  w: { step: "C", alter: 1 },
  s: { step: "D", alter: 0 },
  e: { step: "D", alter: 1 },
  d: { step: "E", alter: 0 },
  f: { step: "F", alter: 0 },
  t: { step: "F", alter: 1 },
  g: { step: "G", alter: 0 },
  y: { step: "G", alter: 1 },
  h: { step: "A", alter: 0 },
  u: { step: "A", alter: 1 },
  j: { step: "B", alter: 0 },
};

export function pitchFromComputerKey(
  key: string,
  octave = 4,
): Pitch | null {
  const entry = COMPUTER_KEY_MAP[key.toLowerCase()];
  if (!entry) return null;
  const pitch = createPitch(entry.step, entry.alter, octave);
  return isPitchInMidiRange(pitch.midi) ? pitch : null;
}
