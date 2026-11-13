import { describe, expect, it } from "vitest";
import { RECORDING_MAX_MEASURES } from "@/application";
import { HUMMING_CONDITIONS, HUMMING_MELODIES, hummingCases, midiToHz, synthesizeHumming } from "../fixtures/humming";
import type { MelodyNote } from "../fixtures/transcription-score";

const Q = 960;
const RATE = 44100;
const one = (midi: number, beats = 2): MelodyNote[] => [{ midi, startTick: 0, durationTicks: beats * Q }];
/** Positive-going zero crossings in [from, to): the cycle count of a clean periodic signal. */
function cycles(samples: Float32Array, from: number, to: number): number {
  let count = 0;
  for (let index = Math.max(1, from); index < to; index += 1) if (samples[index - 1] < 0 && samples[index] >= 0) count += 1;
  return count;
}
/** Longest minus shortest distance between consecutive positive-going zero crossings, in samples. */
function periodSpread(samples: Float32Array, from: number, to: number): number {
  let previous = -1, min = Infinity, max = 0;
  for (let index = Math.max(1, from); index < to; index += 1) {
    if (!(samples[index - 1] < 0 && samples[index] >= 0)) continue;
    if (previous >= 0) { min = Math.min(min, index - previous); max = Math.max(max, index - previous); }
    previous = index;
  }
  return max - min;
}
const peak = (samples: Float32Array, from = 0, to = samples.length) => {
  let max = 0;
  for (let index = from; index < to; index += 1) max = Math.max(max, Math.abs(samples[index]));
  return max;
};

describe("midiToHz", () => {
  it("uses A4 = 440 Hz equal temperament", () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220, 10);
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3);
  });
});

describe("synthesizeHumming", () => {
  it("renders the note at its pitch for its length at the given tempo", () => {
    // 2 beats at 120 BPM = exactly 1 second; a pure tone at A4 has 440 cycles.
    const { samples, sampleRate } = synthesizeHumming(one(69), { tempoBpm: 120, harmonics: [1], articulationGapMs: 0, tailSilenceMs: 0 });
    expect(sampleRate).toBe(RATE);
    expect(samples).toHaveLength(RATE);
    expect(Math.abs(cycles(samples, 0, RATE) - 440)).toBeLessThanOrEqual(1);
    expect(peak(samples)).toBeGreaterThan(0.3);
    expect(peak(samples)).toBeLessThanOrEqual(1);
  });

  it("halving the tempo doubles the length, and the sample rate is honoured", () => {
    const slow = synthesizeHumming(one(69), { tempoBpm: 60, harmonics: [1], articulationGapMs: 0, tailSilenceMs: 0 });
    expect(slow.samples).toHaveLength(2 * RATE);
    const low = synthesizeHumming(one(69), { tempoBpm: 120, sampleRate: 16000, harmonics: [1], articulationGapMs: 0, tailSilenceMs: 0 });
    expect(low.samples).toHaveLength(16000);
    expect(Math.abs(cycles(low.samples, 0, 16000) - 440)).toBeLessThanOrEqual(1);
  });

  it("is silent in rests, in the lead-in, in the tail and in the gap that separates repeated notes", () => {
    const notes: MelodyNote[] = [{ midi: 60, startTick: 0, durationTicks: Q }, { midi: 60, startTick: Q, durationTicks: Q },
      { midi: 64, startTick: 3 * Q, durationTicks: Q }];
    const { samples } = synthesizeHumming(notes, { tempoBpm: 120, leadSilenceMs: 100, tailSilenceMs: 200, articulationGapMs: 40 });
    const lead = 0.1 * RATE, beat = 0.5 * RATE;
    expect(samples).toHaveLength(Math.round(lead + 4 * beat + 0.2 * RATE));
    expect(peak(samples, 0, lead)).toBe(0);
    expect(peak(samples, lead + 2 * beat, lead + 3 * beat)).toBe(0); // the rest on beat 3
    expect(peak(samples, lead + 4 * beat)).toBe(0);
    expect(peak(samples, Math.ceil(lead + beat - 0.04 * RATE) + 1, lead + beat)).toBe(0); // gap before the repeated note
    expect(peak(samples, lead + beat, lead + 2 * beat)).toBeGreaterThan(0.3);
  });

  it("reports where tick 0 falls in the clip, so a transcriber and a scorer share the same grid", () => {
    expect(synthesizeHumming(one(69), { tempoBpm: 120 }).downbeatSeconds).toBe(0);
    expect(synthesizeHumming(one(69), { tempoBpm: 120, leadSilenceMs: 250 }).downbeatSeconds).toBe(0.25);
    // Every case shares the same 200 ms lead-in, so rendering one of them is enough.
    expect(hummingCases()[0].render().downbeatSeconds).toBe(0.2);
  });

  it("detune shifts the pitch by cents and vibrato keeps the average pitch", () => {
    const sharp = synthesizeHumming(one(69), { tempoBpm: 120, harmonics: [1], articulationGapMs: 0, tailSilenceMs: 0, detuneCents: 100 });
    expect(Math.abs(cycles(sharp.samples, 0, RATE) - midiToHz(70))).toBeLessThanOrEqual(1.5);
    const vibrato = synthesizeHumming(one(69), { tempoBpm: 120, harmonics: [1], articulationGapMs: 0, tailSilenceMs: 0, vibratoCents: 50, vibratoHz: 5 });
    expect(Math.abs(cycles(vibrato.samples, 0, RATE) - 440)).toBeLessThanOrEqual(2);
    // ...but the instantaneous pitch moves: the period (about 100 samples at A4) varies by several samples,
    // while a steady tone only shows the ±1 sample rounding of the crossing position.
    const steady = synthesizeHumming(one(69), { tempoBpm: 120, harmonics: [1], articulationGapMs: 0, tailSilenceMs: 0 });
    expect(periodSpread(steady.samples, 4410, RATE - 4410)).toBeLessThanOrEqual(1);
    expect(periodSpread(vibrato.samples, 4410, RATE - 4410)).toBeGreaterThanOrEqual(4);
  });

  it("a scoop starts each note flat and reaches the pitch", () => {
    const { samples } = synthesizeHumming(one(69, 4), { tempoBpm: 120, harmonics: [1], articulationGapMs: 0, tailSilenceMs: 0,
      scoopCents: 200, scoopMs: 200 });
    const early = cycles(samples, 0, 0.1 * RATE) * 10, late = cycles(samples, RATE, 1.1 * RATE) * 10;
    expect(early).toBeLessThan(420);
    expect(Math.abs(late - 440)).toBeLessThanOrEqual(10);
  });

  it("noise is seeded: same seed gives the same samples, another seed differs, and zero noise is exact", () => {
    const options = { tempoBpm: 120, noiseLevel: 0.05, seed: 7 };
    const first = synthesizeHumming(one(60), options), again = synthesizeHumming(one(60), options);
    expect(Array.from(again.samples.slice(0, 2000))).toEqual(Array.from(first.samples.slice(0, 2000)));
    const other = synthesizeHumming(one(60), { ...options, seed: 8 });
    expect(Array.from(other.samples.slice(0, 2000))).not.toEqual(Array.from(first.samples.slice(0, 2000)));
    expect(peak(first.samples)).toBeLessThanOrEqual(1);
    // Noise is present even where no note sounds (room noise), unlike the clean rendering.
    const tail = synthesizeHumming(one(60), { ...options, tailSilenceMs: 300 });
    expect(peak(tail.samples, tail.samples.length - 4000)).toBeGreaterThan(0);
  });

  it("rejects input it cannot render", () => {
    expect(() => synthesizeHumming(one(69), { tempoBpm: 0 })).toThrow(RangeError);
    expect(() => synthesizeHumming(one(69), { tempoBpm: 120, sampleRate: 0 })).toThrow(RangeError);
    expect(() => synthesizeHumming(one(69), { tempoBpm: 120, harmonics: [] })).toThrow(RangeError);
    expect(() => synthesizeHumming([{ midi: 60, startTick: 0, durationTicks: 2 * Q }, { midi: 62, startTick: Q, durationTicks: Q }],
      { tempoBpm: 120 })).toThrow(RangeError); // overlapping notes are not monophonic
    expect(() => synthesizeHumming([{ midi: 200, startTick: 0, durationTicks: Q }], { tempoBpm: 120 })).toThrow(RangeError);
  });
});

describe("hummingCases", () => {
  it("is the full melody × condition grid with unique ids and monophonic, in-range references", () => {
    const cases = hummingCases();
    expect(cases).toHaveLength(HUMMING_MELODIES.length * HUMMING_CONDITIONS.length);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    expect(HUMMING_MELODIES.length).toBeGreaterThanOrEqual(6);
    expect(HUMMING_CONDITIONS.map((item) => item.id)).toEqual(["clean", "vibrato", "scoop", "noisy", "detuned"]);
    for (const melody of HUMMING_MELODIES) {
      expect(melody.notes.length).toBeGreaterThan(0);
      melody.notes.forEach((item, index) => {
        expect(item.midi).toBeGreaterThanOrEqual(40); expect(item.midi).toBeLessThanOrEqual(84);
        if (index > 0) expect(item.startTick).toBeGreaterThanOrEqual(melody.notes[index - 1].startTick + melody.notes[index - 1].durationTicks);
      });
    }
  });

  it("every case fits the 8-measure recording limit and renders in range", () => {
    // Recording limit is measured in measures, not seconds (PHASE4_MASTER_PLAN decision 4).
    for (const item of hummingCases()) {
      const { numerator, denominator } = item.melody.timeSignature;
      const measureTicks = numerator * Q * 4 / denominator;
      const last = item.melody.notes.at(-1)!;
      expect(last.startTick + last.durationTicks).toBeLessThanOrEqual(RECORDING_MAX_MEASURES * measureTicks);
      const { samples, sampleRate } = item.render();
      expect(samples.length).toBeGreaterThan(sampleRate / 2);
      expect(peak(samples)).toBeLessThanOrEqual(1);
    }
  }, 30_000);
});
