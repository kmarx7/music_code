import { describe, expect, it } from "vitest";
import { planRecording, RECORDING_MAX_MEASURES, recordingDownbeatSeconds, recordingLimitSeconds, transcribeRecording, type AudioRecording } from "@/application";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import type { NoteEvent } from "@/domain/score";
import { HUMMING_MELODIES, synthesizeHumming } from "../fixtures/humming";

const cMajor = KEY_SIGNATURE_OPTIONS.find((option) => option.label === "C 장조")!.key;
const four = { numerator: 4, denominator: 4 };
const ids = () => { let next = 0; return () => `rec-${next++}`; };
const asRecording = (clip: { samples: Float32Array; sampleRate: number }): AudioRecording =>
  ({ samples: clip.samples, sampleRate: clip.sampleRate, durationSeconds: clip.samples.length / clip.sampleRate, stoppedBy: "user" });

describe("recordingLimitSeconds", () => {
  it("is 8 measures at the recording's tempo and meter, without the count-in", () => {
    expect(RECORDING_MAX_MEASURES).toBe(8);
    expect(recordingLimitSeconds(120, four)).toBe(16);
    expect(recordingLimitSeconds(60, four)).toBe(32);
    expect(recordingLimitSeconds(20, four)).toBe(96);
    expect(recordingLimitSeconds(120, { numerator: 3, denominator: 4 })).toBe(12);
    expect(recordingLimitSeconds(120, { numerator: 6, denominator: 8 })).toBe(12);
    expect(recordingLimitSeconds(120, four, 4)).toBe(8);
  });

  it("rejects an invalid tempo, meter or measure count", () => {
    expect(() => recordingLimitSeconds(0, four)).toThrow(RangeError);
    expect(() => recordingLimitSeconds(120, { numerator: 4, denominator: 3 })).toThrow(RangeError);
    expect(() => recordingLimitSeconds(120, four, 0)).toThrow(RangeError);
  });
});

describe("transcribeRecording", () => {
  it("turns a recording into a spelled candidate payload on the recording's grid", () => {
    const scale = HUMMING_MELODIES.find((melody) => melody.id === "scale")!;
    const clip = synthesizeHumming(scale.notes, { tempoBpm: scale.tempoBpm, leadSilenceMs: 600 });
    const recording = asRecording(clip);
    const before = Float32Array.from(recording.samples);
    const result = transcribeRecording(recording, { tempoBpm: scale.tempoBpm, timeSignature: four, key: cMajor,
      downbeatSeconds: clip.downbeatSeconds, nextId: ids() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notes = result.clipboard.events.filter((event): event is NoteEvent => event.kind === "note");
    expect(notes.map((note) => note.pitch.midi)).toEqual(scale.notes.map((note) => note.midi));
    expect(notes.map((note) => note.startTick)).toEqual(scale.notes.map((note) => note.startTick));
    expect(result.notes).toHaveLength(scale.notes.length);
    expect(recording.samples).toEqual(before);
  });

  it("reports SILENT for a recording with no audible input", () => {
    const silent = asRecording({ samples: new Float32Array(48000).fill(0.002), sampleRate: 48000 });
    expect(transcribeRecording(silent, { tempoBpm: 120, timeSignature: four, key: cMajor, nextId: ids() }))
      .toMatchObject({ ok: false, issue: "SILENT" });
  });

  it("reports NO_NOTES when the input is audible but holds no pitched note", () => {
    const noise = asRecording(synthesizeHumming([], { tempoBpm: 120, leadSilenceMs: 2000, noiseLevel: 0.3, seed: 5 }));
    expect(transcribeRecording(noise, { tempoBpm: 120, timeSignature: four, key: cMajor, nextId: ids() }))
      .toMatchObject({ ok: false, issue: "NO_NOTES" });
  });
});

describe("planRecording", () => {
  it("counts in one measure and clicks on the meter's beat unit, with room for the click lead", () => {
    expect(planRecording(120, four)).toEqual({ beatSeconds: 0.5, beatsPerMeasure: 4, countInBeats: 4, recordingBeats: 32,
      countInSeconds: 2, limitSeconds: 16, maxSeconds: 2 + 16 + 0.5 });
    // 6/8 at a quarter-note tempo of 120: eighth-note clicks of 0.25 s, six per measure (same rule as playback).
    expect(planRecording(120, { numerator: 6, denominator: 8 })).toMatchObject({ beatSeconds: 0.25, beatsPerMeasure: 6, countInBeats: 6,
      recordingBeats: 48, countInSeconds: 1.5, limitSeconds: 12 });
  });

  it("places tick 0 one count-in after the first click", () => {
    const plan = planRecording(120, four);
    const recording: AudioRecording = { samples: new Float32Array(1), sampleRate: 48000, durationSeconds: 1, stoppedBy: "user",
      metronomeStartSeconds: 0.3 };
    expect(recordingDownbeatSeconds(recording, plan)).toBeCloseTo(2.3, 12);
    expect(recordingDownbeatSeconds({ ...recording, metronomeStartSeconds: undefined }, plan)).toBeUndefined();
  });
});
