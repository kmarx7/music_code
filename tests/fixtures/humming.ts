/**
 * Synthetic humming for Phase 4 tests: PCM generated in code from a reference melody. No audio files.
 * These signals are far simpler than a real voice; scores on them say nothing about real humming quality.
 */
import { assertMelodyNote, type MelodyNote } from "./transcription-score";

const TICKS_PER_QUARTER = 960;

export type HummingOptions = {
  tempoBpm: number;
  sampleRate?: number;
  /** Relative amplitude of each harmonic, fundamental first. */
  harmonics?: readonly number[];
  /** Peak level of the voiced signal, 0–1. */
  amplitude?: number;
  /** Constant offset of every note, in cents. */
  detuneCents?: number;
  vibratoCents?: number; vibratoHz?: number;
  /** Each note starts this many cents flat and glides up to pitch over `scoopMs`. */
  scoopCents?: number; scoopMs?: number;
  /** Uniform white noise level, 0–1, present for the whole clip (including silence). */
  noiseLevel?: number; seed?: number;
  attackMs?: number; releaseMs?: number;
  /** Silence cut from the end of every note, so repeated notes are separated. */
  articulationGapMs?: number;
  leadSilenceMs?: number; tailSilenceMs?: number;
};

export type HummingClip = { samples: Float32Array; sampleRate: number };

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Small seeded generator (mulberry32) so noisy fixtures are reproducible. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative number: ${value}`);
  return value;
}

export function synthesizeHumming(notes: readonly MelodyNote[], options: HummingOptions): HummingClip {
  const { tempoBpm } = options;
  const sampleRate = options.sampleRate ?? 44100;
  const harmonics = options.harmonics ?? [1, 0.5, 0.3, 0.15];
  if (!Number.isFinite(tempoBpm) || tempoBpm <= 0) throw new RangeError(`Invalid tempo: ${tempoBpm}`);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError(`Invalid sample rate: ${sampleRate}`);
  const weight = harmonics.reduce((total, value) => total + Math.abs(value), 0);
  if (harmonics.length === 0 || !Number.isFinite(weight) || weight <= 0) throw new RangeError("At least one harmonic is required");
  const amplitude = nonNegative("amplitude", options.amplitude ?? 0.8);
  const noiseLevel = nonNegative("noiseLevel", options.noiseLevel ?? 0);
  if (amplitude > 1 || noiseLevel > 1) throw new RangeError("amplitude and noiseLevel must be at most 1");
  const detune = options.detuneCents ?? 0, vibratoCents = options.vibratoCents ?? 0, vibratoHz = nonNegative("vibratoHz", options.vibratoHz ?? 5);
  const scoopCents = options.scoopCents ?? 0, scoop = nonNegative("scoopMs", options.scoopMs ?? 80) / 1000;
  const attack = nonNegative("attackMs", options.attackMs ?? 10) / 1000, release = nonNegative("releaseMs", options.releaseMs ?? 20) / 1000;
  const gap = nonNegative("articulationGapMs", options.articulationGapMs ?? 30) / 1000;
  const lead = nonNegative("leadSilenceMs", options.leadSilenceMs ?? 0) / 1000, tail = nonNegative("tailSilenceMs", options.tailSilenceMs ?? 0) / 1000;

  const ordered = [...notes].sort((a, b) => a.startTick - b.startTick);
  ordered.forEach((note, index) => {
    assertMelodyNote(note);
    const previous = ordered[index - 1];
    if (previous && note.startTick < previous.startTick + previous.durationTicks) throw new RangeError("Notes overlap: the melody must be monophonic");
  });
  const secondsPerTick = 60 / tempoBpm / TICKS_PER_QUARTER;
  const last = ordered.at(-1);
  const melodySeconds = last ? (last.startTick + last.durationTicks) * secondsPerTick : 0;
  const samples = new Float32Array(Math.round((lead + melodySeconds + tail) * sampleRate));

  for (const note of ordered) {
    const startSeconds = lead + note.startTick * secondsPerTick, length = note.durationTicks * secondsPerTick;
    const span = length - Math.min(gap, length / 2);
    const from = Math.round(startSeconds * sampleRate), to = Math.min(samples.length, Math.round((startSeconds + span) * sampleRate));
    const steady = midiToHz(note.midi) * 2 ** (detune / 1200);
    let phase = 0;
    for (let index = from; index < to; index += 1) {
      const t = (index - from) / sampleRate;
      // Only notes that actually bend pay for the per-sample power.
      const bend = (vibratoCents !== 0 ? vibratoCents * Math.sin(2 * Math.PI * vibratoHz * t) : 0)
        - (scoopCents !== 0 && t < scoop ? scoopCents * (1 - t / scoop) : 0);
      const frequency = bend === 0 ? steady : steady * 2 ** (bend / 1200);
      let value = 0;
      for (let k = 0; k < harmonics.length; k += 1) {
        if ((k + 1) * frequency < sampleRate / 2) value += harmonics[k]! * Math.sin((k + 1) * phase);
      }
      const envelope = Math.min(1, attack > 0 ? t / attack : 1, release > 0 ? (span - t) / release : 1);
      samples[index] = (amplitude * envelope * value) / weight;
      phase += (2 * Math.PI * frequency) / sampleRate;
    }
  }
  if (noiseLevel > 0) {
    const next = random(options.seed ?? 1);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.max(-1, Math.min(1, samples[index]! + noiseLevel * (2 * next() - 1)));
    }
  }
  return { samples, sampleRate };
}

export type HummingMelody = {
  id: string; description: string; tempoBpm: number;
  timeSignature: { numerator: number; denominator: number };
  notes: readonly MelodyNote[];
};
export type HummingCondition = { id: string; description: string; options: Partial<HummingOptions> };
export type HummingCase = { id: string; melody: HummingMelody; condition: HummingCondition; render(): HummingClip };

const Q = TICKS_PER_QUARTER;
/** `[midi, beats]` in order; `null` is a rest. */
function line(items: readonly (readonly [number | null, number])[]): MelodyNote[] {
  const notes: MelodyNote[] = [];
  let tick = 0;
  for (const [midi, beats] of items) {
    if (midi !== null) notes.push({ midi, startTick: tick, durationTicks: beats * Q });
    tick += beats * Q;
  }
  return notes;
}
const four = { numerator: 4, denominator: 4 };

export const HUMMING_MELODIES: readonly HummingMelody[] = [
  { id: "scale", description: "C major scale up, quarter notes, 2 bars", tempoBpm: 100, timeSignature: four,
    notes: line([[60, 1], [62, 1], [64, 1], [65, 1], [67, 1], [69, 1], [71, 1], [72, 1]]) },
  { id: "repeated", description: "Same pitch repeated, then a held note, 4 bars", tempoBpm: 100, timeSignature: four,
    notes: line([[67, 1], [67, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2], [60, 2]]) },
  { id: "rests", description: "Quarter and half rests between notes, 4 bars", tempoBpm: 100, timeSignature: four,
    notes: line([[60, 1], [null, 1], [64, 1], [null, 1], [67, 2], [null, 2], [65, 1], [64, 1], [null, 2], [60, 4]]) },
  { id: "leaps", description: "Octave and wide leaps, 4 bars", tempoBpm: 90, timeSignature: four,
    notes: line([[60, 1], [72, 1], [64, 1], [76, 1], [57, 1], [69, 1], [62, 2], [55, 1], [67, 1], [60, 1], [72, 1], [65, 2], [60, 2]]) },
  { id: "eighths", description: "Eighth-note run with quarters, 2 bars", tempoBpm: 90, timeSignature: four,
    notes: line([[60, 0.5], [62, 0.5], [64, 0.5], [65, 0.5], [67, 1], [65, 0.5], [64, 0.5], [62, 0.5], [64, 0.5], [65, 0.5], [62, 0.5], [60, 2]]) },
  { id: "low", description: "Low voice range (G2–G3), 2 bars", tempoBpm: 90, timeSignature: four,
    notes: line([[43, 1], [45, 1], [47, 1], [48, 1], [50, 1], [52, 1], [55, 2]]) },
  { id: "high", description: "High voice range (C5–C6), 2 bars", tempoBpm: 90, timeSignature: four,
    notes: line([[72, 1], [74, 1], [76, 1], [77, 1], [79, 1], [81, 1], [84, 2]]) },
  { id: "waltz", description: "3/4 with dotted halves, 4 bars", tempoBpm: 120, timeSignature: { numerator: 3, denominator: 4 },
    notes: line([[64, 1], [65, 1], [67, 1], [72, 3], [71, 1], [69, 1], [67, 1], [64, 3]]) },
];

export const HUMMING_CONDITIONS: readonly HummingCondition[] = [
  { id: "clean", description: "Steady pitch, no noise", options: {} },
  { id: "vibrato", description: "±40 cents at 5.5 Hz", options: { vibratoCents: 40, vibratoHz: 5.5 } },
  { id: "scoop", description: "Each note starts 150 cents flat, 80 ms glide", options: { scoopCents: 150, scoopMs: 80 } },
  { id: "noisy", description: "White noise at 0.05", options: { noiseLevel: 0.05 } },
  { id: "detuned", description: "Whole clip 30 cents sharp", options: { detuneCents: 30 } },
];

/** Every melody under every condition. Noise seeds are fixed per case, so each clip is identical on every run. */
export function hummingCases(): HummingCase[] {
  return HUMMING_MELODIES.flatMap((melody, m) => HUMMING_CONDITIONS.map((condition, c) => ({
    id: `${melody.id}/${condition.id}`, melody, condition,
    render: () => synthesizeHumming(melody.notes, { tempoBpm: melody.tempoBpm, leadSilenceMs: 200, tailSilenceMs: 300,
      seed: 1000 + m * 10 + c, ...condition.options }),
  })));
}
