import { describe, expect, it } from "vitest";
import { estimatePitchTrack, smoothPitchContour, type PitchFrame } from "@/domain/transcription";
import { hummingCases, midiToHz, synthesizeHumming } from "../fixtures/humming";
import type { MelodyNote } from "../fixtures/transcription-score";

const Q = 960;
const RATE = 44100;
const cents = (hz: number, reference: number) => 1200 * Math.log2(hz / reference);
const voiced = (frames: PitchFrame[]) => frames.filter((frame) => frame.voiced);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
/** A pure sine (continuous phase) that follows `hzAt(time)`. */
function tone(seconds: number, hzAt: (time: number) => number, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(Math.round(seconds * RATE));
  let phase = 0;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = amplitude * Math.sin(phase);
    phase += (2 * Math.PI * hzAt(index / RATE)) / RATE;
  }
  return samples;
}
/** Frames well inside [from, to) seconds, away from onsets and releases. */
const inside = (frames: PitchFrame[], from: number, to: number, guard = 0.06) =>
  frames.filter((frame) => frame.timeSeconds >= from + guard && frame.timeSeconds <= to - guard);

describe("estimatePitchTrack", () => {
  it("tracks a pure tone to within a few cents", () => {
    const frames = estimatePitchTrack(tone(1, () => 440), RATE);
    const steady = inside(frames, 0, 1);
    expect(steady.length).toBeGreaterThan(50);
    for (const frame of steady) {
      expect(frame.voiced).toBe(true);
      expect(Math.abs(cents(frame.frequencyHz!, 440))).toBeLessThan(10);
      expect(frame.midi!).toBeCloseTo(69, 1);
      expect(frame.confidence).toBeGreaterThan(0.8);
    }
  });

  it("gives the same pitch whatever the input sample rate (decimated or not)", () => {
    for (const sampleRate of [16000, 22050, 44100, 48000]) {
      for (const midi of [45, 69, 84]) {
        const notes: MelodyNote[] = [{ midi, startTick: 0, durationTicks: 2 * Q }];
        const clip = synthesizeHumming(notes, { tempoBpm: 120, sampleRate, articulationGapMs: 0 });
        const steady = inside(estimatePitchTrack(clip.samples, clip.sampleRate), 0, 1);
        expect(steady.length, `${sampleRate} Hz`).toBeGreaterThan(50);
        expect(Math.abs(cents(median(steady.map((frame) => frame.frequencyHz!)), midiToHz(midi))), `${sampleRate} Hz MIDI ${midi}`)
          .toBeLessThan(10);
      }
    }
  });

  it("finds the fundamental of a harmonic voice across the humming range without octave errors", () => {
    for (const midi of [43, 48, 57, 64, 69, 76, 84]) {
      const notes: MelodyNote[] = [{ midi, startTick: 0, durationTicks: 2 * Q }];
      const { samples, sampleRate } = synthesizeHumming(notes, { tempoBpm: 120, articulationGapMs: 0 });
      const steady = inside(estimatePitchTrack(samples, sampleRate), 0, 1);
      expect(steady.every((frame) => frame.voiced), `MIDI ${midi} voiced`).toBe(true);
      expect(Math.abs(cents(median(steady.map((frame) => frame.frequencyHz!)), midiToHz(midi))), `MIDI ${midi}`).toBeLessThan(10);
      for (const frame of steady) expect(Math.abs(frame.midi! - midi), `MIDI ${midi} at ${frame.timeSeconds}`).toBeLessThan(0.5);
    }
  });

  it("produces no voiced frame from silence or from noise alone", () => {
    expect(voiced(estimatePitchTrack(new Float32Array(RATE), RATE))).toEqual([]);
    const noise = synthesizeHumming([], { tempoBpm: 120, leadSilenceMs: 2000, noiseLevel: 0.05, seed: 3 });
    const frames = estimatePitchTrack(noise.samples, noise.sampleRate);
    expect(frames.length).toBeGreaterThan(150);
    expect(voiced(frames)).toEqual([]);
    const loudNoise = synthesizeHumming([], { tempoBpm: 120, leadSilenceMs: 2000, noiseLevel: 0.5, seed: 4 });
    expect(voiced(estimatePitchTrack(loudNoise.samples, loudNoise.sampleRate))).toEqual([]);
  });

  it("emits frames at a fixed hop with centre times, and leaves rests unvoiced", () => {
    // 120 BPM: note on beat 1, rest on beat 2, note on beat 3 (0.5 s per beat).
    const notes: MelodyNote[] = [{ midi: 60, startTick: 0, durationTicks: Q }, { midi: 64, startTick: 2 * Q, durationTicks: Q }];
    const clip = synthesizeHumming(notes, { tempoBpm: 120 });
    const frames = estimatePitchTrack(clip.samples, clip.sampleRate, { hopSeconds: 0.01 });
    for (let index = 1; index < frames.length; index += 1) {
      expect(frames[index].timeSeconds - frames[index - 1].timeSeconds).toBeCloseTo(0.01, 3);
    }
    expect(frames[0].timeSeconds).toBeGreaterThan(0);
    expect(frames.at(-1)!.timeSeconds).toBeLessThan(clip.samples.length / clip.sampleRate);
    expect(voiced(inside(frames, 0.5, 1))).toEqual([]);
    expect(inside(frames, 0, 0.47).every((frame) => frame.voiced && Math.abs(frame.midi! - 60) < 0.5)).toBe(true);
    expect(inside(frames, 1, 1.47).every((frame) => frame.voiced && Math.abs(frame.midi! - 64) < 0.5)).toBe(true);
  });

  it("smoothPitchContour folds a brief octave slip back but keeps a real octave leap", () => {
    // Estimator slips happen inside one continuous voiced run, so the contour is tested directly.
    const slip = [...Array(9).fill(57), 69, 69, 69, ...Array(9).fill(57)];
    expect(smoothPitchContour(slip).every((value) => Math.abs(value - 57) < 1e-9)).toBe(true);
    const below = [...Array(9).fill(69), 57, 57, ...Array(9).fill(69)];
    expect(smoothPitchContour(below).every((value) => Math.abs(value - 69) < 1e-9)).toBe(true);
    const leap = [...Array(10).fill(60), ...Array(10).fill(72)];
    expect(smoothPitchContour(leap)).toEqual(leap);
    expect(smoothPitchContour([])).toEqual([]);
  });

  it("does not invent a voiced frame at the wrong octave when the voice really jumps briefly", () => {
    const samples = tone(1, (time) => (time >= 0.48 && time < 0.52 ? 440 : 220));
    for (const frame of voiced(inside(estimatePitchTrack(samples, RATE), 0, 1))) {
      expect([57, 69].some((midi) => Math.abs(frame.midi! - midi) < 0.5), `at ${frame.timeSeconds}`).toBe(true);
    }
  });

  it("returns no frames for a clip shorter than one analysis window", () => {
    expect(estimatePitchTrack(new Float32Array(0), RATE)).toEqual([]);
    expect(estimatePitchTrack(new Float32Array(100), RATE)).toEqual([]);
  });

  it("rejects input it cannot analyse", () => {
    expect(() => estimatePitchTrack(new Float32Array(RATE), 0)).toThrow(RangeError);
    expect(() => estimatePitchTrack(new Float32Array(RATE), Number.NaN)).toThrow(RangeError);
    const bad = new Float32Array(RATE); bad[10] = Number.NaN;
    expect(() => estimatePitchTrack(bad, RATE)).toThrow(RangeError);
    expect(() => estimatePitchTrack(new Float32Array(RATE), RATE, { minHz: 500, maxHz: 400 })).toThrow(RangeError);
    expect(() => estimatePitchTrack(new Float32Array(RATE), RATE, { hopSeconds: 0 })).toThrow(RangeError);
  });

  it("is deterministic and does not modify its input", () => {
    const samples = tone(0.5, () => 330);
    const copy = Float32Array.from(samples);
    const first = estimatePitchTrack(samples, RATE);
    expect(estimatePitchTrack(samples, RATE)).toEqual(first);
    expect(samples).toEqual(copy);
  });
});

/**
 * Frame-level accuracy on the 40 synthetic cases (P4-02 acceptance record). Floors fixed before implementation.
 * Reference-voiced: frames whose centre is ≥100 ms after a note's onset (past the scoop) and ≥60 ms before it stops sounding.
 * Reference-silent: frames whose centre is ≥60 ms away from any sounding note.
 */
describe("pitch accuracy on the synthetic humming set", () => {
  it("meets the frame-level floors and has no octave errors", () => {
    let referenceVoiced = 0, detected = 0, within50 = 0, octave = 0, silent = 0, falseVoiced = 0;
    const perCondition = new Map<string, { frames: number; within50: number }>();
    for (const item of hummingCases()) {
      const clip = item.render();
      const secondsPerTick = 60 / item.melody.tempoBpm / Q;
      const spans = item.melody.notes.map((note) => ({
        midi: note.midi,
        from: clip.downbeatSeconds + note.startTick * secondsPerTick,
        // The fixture cuts 30 ms off each note so repeated notes are separated.
        to: clip.downbeatSeconds + (note.startTick + note.durationTicks) * secondsPerTick - 0.03,
      }));
      const condition = perCondition.get(item.condition.id) ?? { frames: 0, within50: 0 };
      for (const frame of estimatePitchTrack(clip.samples, clip.sampleRate)) {
        const t = frame.timeSeconds;
        const note = spans.find((span) => t >= span.from + 0.1 && t <= span.to - 0.06);
        if (note) {
          referenceVoiced += 1; condition.frames += 1;
          if (!frame.voiced) continue;
          detected += 1;
          const error = frame.midi! - note.midi;
          if (Math.abs(error) <= 0.5) { within50 += 1; condition.within50 += 1; }
          else if (Math.abs(error) >= 11 && (Math.abs(error) % 12 < 1 || Math.abs(error) % 12 > 11)) octave += 1;
        } else if (spans.every((span) => t < span.from - 0.06 || t > span.to + 0.06)) {
          silent += 1;
          if (frame.voiced) falseVoiced += 1;
        }
      }
      perCondition.set(item.condition.id, condition);
    }
    const report = {
      referenceVoiced, voicingRecall: detected / referenceVoiced, rawPitchAccuracy50: within50 / referenceVoiced,
      octaveErrors: octave, silentFrames: silent, falseVoiced,
      byCondition: Object.fromEntries([...perCondition].map(([id, value]) => [id, +(value.within50 / value.frames).toFixed(4)])),
    };
    expect(report.referenceVoiced).toBeGreaterThan(5000);
    expect(report.silentFrames).toBeGreaterThan(1000);
    expect(report.voicingRecall, JSON.stringify(report)).toBeGreaterThanOrEqual(0.95);
    expect(report.rawPitchAccuracy50, JSON.stringify(report)).toBeGreaterThanOrEqual(0.95);
    expect(report.octaveErrors, JSON.stringify(report)).toBe(0);
    expect(report.falseVoiced, JSON.stringify(report)).toBe(0);
  }, 60_000);
});
