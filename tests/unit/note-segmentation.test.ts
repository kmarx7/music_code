import { describe, expect, it } from "vitest";
import { estimatePitchTrack, segmentNotes, type NoteSegment, type PitchFrame } from "@/domain/transcription";
import { HUMMING_MELODIES, hummingCases, synthesizeHumming } from "../fixtures/humming";
import type { MelodyNote } from "../fixtures/transcription-score";

const Q = 960;
/** 120 BPM: one beat is 0.5 s. */
const at120 = (notes: MelodyNote[], options: Parameters<typeof synthesizeHumming>[1] = { tempoBpm: 120 }) => {
  const clip = synthesizeHumming(notes, options);
  return segmentNotes(estimatePitchTrack(clip.samples, clip.sampleRate));
};
const beats = (items: [number | null, number][]): MelodyNote[] => {
  const notes: MelodyNote[] = [];
  let tick = 0;
  for (const [midi, length] of items) {
    if (midi !== null) notes.push({ midi, startTick: tick, durationTicks: length * Q });
    tick += length * Q;
  }
  return notes;
};
/** Synthetic frame list at a 10 ms hop. */
const frames = (items: { midi: number | null; count: number; rms?: number }[]): PitchFrame[] => {
  const out: PitchFrame[] = [];
  for (const { midi, count, rms = 0.3 } of items) {
    for (let index = 0; index < count; index += 1) {
      const timeSeconds = 0.015 + out.length * 0.01;
      out.push(midi === null
        ? { timeSeconds, voiced: false, frequencyHz: null, midi: null, confidence: 0, rms: 0 }
        : { timeSeconds, voiced: true, frequencyHz: 440 * 2 ** ((midi - 69) / 12), midi, confidence: 0.95, rms });
    }
  }
  return out;
};

describe("segmentNotes", () => {
  it("turns one steady note into one segment with its pitch and boundaries", () => {
    const [segment, ...rest] = at120(beats([[64, 2]]));
    expect(rest).toEqual([]);
    expect(segment.midi).toBe(64);
    expect(segment.pitchMidi).toBeCloseTo(64, 1);
    expect(Math.abs(segment.startSeconds - 0)).toBeLessThan(0.03);
    expect(Math.abs(segment.endSeconds - 0.97)).toBeLessThan(0.05);
    expect(segment.confidence).toBeGreaterThan(0.8);
    expect(segment.frameCount).toBeGreaterThan(80);
  });

  it("splits at a change of pitch", () => {
    expect(at120(beats([[60, 1], [62, 1], [64, 1], [65, 1]])).map((segment) => segment.midi)).toEqual([60, 62, 64, 65]);
  });

  it("splits repeated notes of the same pitch at the articulation dip", () => {
    const segments = at120(beats([[67, 1], [67, 1], [67, 1], [67, 1]]));
    expect(segments.map((segment) => segment.midi)).toEqual([67, 67, 67, 67]);
    segments.forEach((segment, index) => expect(Math.abs(segment.startSeconds - index * 0.5), `note ${index}`).toBeLessThan(0.03));
  });

  it("splits repeated notes on a level dip even when every frame stays voiced", () => {
    const segments = segmentNotes(frames([{ midi: 67, count: 30 }, { midi: 67, count: 2, rms: 0.05 }, { midi: 67, count: 30 }]));
    expect(segments).toHaveLength(2);
    expect(segments[0].endSeconds).toBeLessThanOrEqual(segments[1].startSeconds);
  });

  it("leaves a rest as a gap between segments", () => {
    const [first, second] = at120(beats([[60, 1], [null, 1], [64, 1]]));
    expect(first.endSeconds).toBeLessThan(0.55);
    expect(second.startSeconds).toBeGreaterThan(0.97);
    expect(second.midi).toBe(64);
  });

  it("absorbs a scoop into its note and keeps vibrato and detuned notes whole", () => {
    const melody = beats([[60, 1], [64, 1], [67, 1], [72, 1]]);
    for (const options of [{ scoopCents: 150, scoopMs: 80 }, { vibratoCents: 40, vibratoHz: 5.5 }, { detuneCents: 30 },
      { detuneCents: 30, vibratoCents: 40, vibratoHz: 5.5 }]) {
      expect(at120(melody, { tempoBpm: 120, ...options }).map((segment) => segment.midi), JSON.stringify(options)).toEqual([60, 64, 67, 72]);
    }
  });

  it("merges a short excursion into the surrounding note and drops a voiced blip too short to be a note", () => {
    const excursion = segmentNotes(frames([{ midi: 60, count: 20 }, { midi: 61.2, count: 3 }, { midi: 60, count: 20 }]));
    expect(excursion.map((segment) => segment.midi)).toEqual([60]);
    const blip = segmentNotes(frames([{ midi: null, count: 10 }, { midi: 70, count: 4 }, { midi: null, count: 10 }, { midi: 62, count: 30 }]));
    expect(blip.map((segment) => segment.midi)).toEqual([62]);
  });

  it("folds a legato glide into the note it reaches and a fall-off into the note it leaves, but keeps a short steady note", () => {
    const ramp = (from: number, to: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({ midi: from + ((to - from) * index) / (count - 1), count: 1 }));
    const legato = segmentNotes(frames([{ midi: 60, count: 30 }, ...ramp(60.5, 61.6, 9), { midi: 62, count: 30 }]));
    expect(legato.map((segment) => segment.midi)).toEqual([60, 62]);
    const fallOff = segmentNotes(frames([{ midi: 62, count: 30 }, ...ramp(61.6, 60.4, 9)]));
    expect(fallOff.map((segment) => segment.midi)).toEqual([62]);
    const shortNote = segmentNotes(frames([{ midi: 62, count: 30 }, { midi: 64, count: 10 }, { midi: 66, count: 30 }]));
    expect(shortNote.map((segment) => segment.midi)).toEqual([62, 64, 66]);
  });

  it("returns nothing for no frames or only unvoiced frames", () => {
    expect(segmentNotes([])).toEqual([]);
    expect(segmentNotes(frames([{ midi: null, count: 50 }]))).toEqual([]);
  });

  it("rejects frames out of time order and invalid options, and does not modify its input", () => {
    const input = frames([{ midi: 60, count: 20 }]);
    const before = JSON.stringify(input);
    segmentNotes(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(() => segmentNotes([input[1], input[0]])).toThrow(RangeError);
    expect(() => segmentNotes(input, { minNoteSeconds: -1 })).toThrow(RangeError);
    expect(() => segmentNotes(input, { levelDipRatio: 1.5 })).toThrow(RangeError);
  });
});

/**
 * Note-level accuracy on the 40 synthetic cases (P4-03 acceptance record). Floors fixed before implementation.
 * A segment matches a reference note when the MIDI is equal and the onset is within 50 ms (one to one, in order).
 * Reference offsets are where the fixture stops the sound (30 ms articulation gap before the next beat).
 */
describe("note segmentation on the synthetic humming set", () => {
  it("meets the note-level floors", () => {
    let references = 0, predicted = 0, matched = 0;
    const onsetErrors: number[] = [], offsetErrors: number[] = [];
    const countMismatches: string[] = [];
    for (const item of hummingCases()) {
      const clip = item.render();
      const secondsPerTick = 60 / item.melody.tempoBpm / Q;
      const segments: NoteSegment[] = segmentNotes(estimatePitchTrack(clip.samples, clip.sampleRate));
      references += item.melody.notes.length; predicted += segments.length;
      if (segments.length !== item.melody.notes.length) countMismatches.push(`${item.id}: ${segments.length}/${item.melody.notes.length}`);
      const used = new Set<number>();
      for (const note of item.melody.notes) {
        const onset = clip.downbeatSeconds + note.startTick * secondsPerTick;
        const offset = clip.downbeatSeconds + (note.startTick + note.durationTicks) * secondsPerTick - 0.03;
        const index = segments.findIndex((segment, i) => !used.has(i) && segment.midi === note.midi && Math.abs(segment.startSeconds - onset) <= 0.05);
        if (index < 0) continue;
        used.add(index); matched += 1;
        onsetErrors.push(Math.abs(segments[index].startSeconds - onset));
        offsetErrors.push(Math.abs(segments[index].endSeconds - offset));
      }
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? Infinity;
    const report = {
      references, predicted, matched, precision: matched / predicted, recall: matched / references,
      medianOnsetErrorMs: Math.round(median(onsetErrors) * 1000), maxOnsetErrorMs: Math.round(Math.max(...onsetErrors) * 1000),
      medianOffsetErrorMs: Math.round(median(offsetErrors) * 1000), maxOffsetErrorMs: Math.round(Math.max(...offsetErrors) * 1000),
      countMismatches,
    };
    const text = JSON.stringify(report);
    expect(report.recall, text).toBeGreaterThanOrEqual(0.95);
    expect(report.precision, text).toBeGreaterThanOrEqual(0.95);
    expect(report.medianOnsetErrorMs, text).toBeLessThanOrEqual(30);
    expect(report.medianOffsetErrorMs, text).toBeLessThanOrEqual(50);
    const repeated = HUMMING_MELODIES.find((melody) => melody.id === "repeated")!;
    expect(countMismatches.filter((entry) => entry.startsWith(`${repeated.id}/`)), text).toEqual([]);
  }, 60_000);
});
