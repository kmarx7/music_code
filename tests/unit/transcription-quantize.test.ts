import { describe, expect, it } from "vitest";
import { applyEditCommand } from "@/domain/commands";
import { KEY_SIGNATURE_OPTIONS, spellMidiInKey } from "@/domain/music-theory";
import { createEmptyScore, measureTicks, validateScore } from "@/domain/score";
import type { KeySignature, NoteEvent, Score } from "@/domain/score";
import {
  estimatePitchTrack, quantizeSegments, segmentNotes, transcriptionToClipboard, type NoteSegment,
} from "@/domain/transcription";
import { hummingCases } from "../fixtures/humming";
import { aggregateTranscriptionScores, scoreTranscription, type TranscriptionScore } from "../fixtures/transcription-score";

const Q = 960;
const four = { numerator: 4, denominator: 4 };
const keyOf = (label: string): KeySignature => KEY_SIGNATURE_OPTIONS.find((option) => option.label === label)!.key;
/** 120 BPM: one beat 0.5 s, one 16th (240 ticks) 0.125 s. */
const segment = (midi: number, startSeconds: number, endSeconds: number, confidence = 0.9): NoteSegment =>
  ({ midi, pitchMidi: midi, startSeconds, endSeconds, confidence, frameCount: Math.round((endSeconds - startSeconds) * 100) });
const quantize120 = (segments: NoteSegment[], downbeatSeconds = 0) =>
  quantizeSegments(segments, { tempoBpm: 120, timeSignature: four, downbeatSeconds });
const ids = () => { let next = 0; return () => `tr-${next++}`; };

describe("spellMidiInKey", () => {
  it("uses the key's own letters for diatonic notes, including Cb and E#", () => {
    const cases: [string, number, string, number, number][] = [
      ["C 장조", 60, "C", 0, 4], ["F 장조", 70, "B", -1, 4], ["D 장조", 66, "F", 1, 4],
      ["Gb 장조", 71, "C", -1, 5], ["F# 장조", 65, "E", 1, 4], ["D 단조", 70, "B", -1, 4],
    ];
    for (const [label, midi, step, alter, octave] of cases) {
      expect(spellMidiInKey(midi, keyOf(label)), `${label} ${midi}`).toEqual({ midi, step, alter, octave });
    }
  });

  it("spells chromatic notes with sharps in sharp and natural keys and with flats in flat keys", () => {
    expect(spellMidiInKey(61, keyOf("C 장조"))).toMatchObject({ step: "C", alter: 1 });
    expect(spellMidiInKey(63, keyOf("G 장조"))).toMatchObject({ step: "D", alter: 1 });
    expect(spellMidiInKey(61, keyOf("F 장조"))).toMatchObject({ step: "D", alter: -1 });
    expect(spellMidiInKey(66, keyOf("Bb 장조"))).toMatchObject({ step: "G", alter: -1 });
  });

  it("rejects a MIDI number outside 0–127 or not an integer", () => {
    expect(() => spellMidiInKey(128, keyOf("C 장조"))).toThrow(RangeError);
    expect(() => spellMidiInKey(60.5, keyOf("C 장조"))).toThrow(RangeError);
  });
});

describe("quantizeSegments", () => {
  it("rounds onsets and offsets to the 16th grid relative to the downbeat", () => {
    const { notes, lengthTicks } = quantize120([segment(60, 0.21, 0.69), segment(62, 0.73, 1.18)], 0.2);
    expect(notes.map(({ midi, startTick, durationTicks }) => ({ midi, startTick, durationTicks }))).toEqual([
      { midi: 60, startTick: 0, durationTicks: 960 }, { midi: 62, startTick: 960, durationTicks: 960 }]);
    expect(lengthTicks).toBe(1920);
  });

  it("gives every note at least one grid step and reports how far each boundary moved", () => {
    const { notes } = quantize120([segment(64, 0.02, 0.07)]);
    expect(notes[0]).toMatchObject({ startTick: 0, durationTicks: 240 });
    expect(notes[0].onsetShiftSeconds).toBeCloseTo(-0.02, 6);
    expect(notes[0].confidence).toBe(0.9);
  });

  it("drops a note that ends before the downbeat and clips one that straddles it", () => {
    const result = quantize120([segment(55, 0.0, 0.1), segment(57, 0.4, 1.0), segment(60, 1.0, 1.5)], 0.5);
    expect(result.notes.map(({ midi, startTick, durationTicks }) => ({ midi, startTick, durationTicks }))).toEqual([
      { midi: 57, startTick: 0, durationTicks: 960 }, { midi: 60, startTick: 960, durationTicks: 960 }]);
    expect(result.dropped).toEqual([{ index: 0, reason: "BEFORE_DOWNBEAT" }]);
  });

  it("keeps the line monophonic: an earlier note ends where the next starts, and a same-onset collision keeps the longer", () => {
    const overlap = quantize120([segment(60, 0, 0.56), segment(62, 0.5, 1.0)]);
    expect(overlap.notes.map((note) => [note.startTick, note.durationTicks])).toEqual([[0, 960], [960, 960]]);
    expect(overlap.notes[0].endShiftSeconds).toBeCloseTo(-0.06, 6); // performed to 0.56 s, trimmed to the next onset at 0.5 s
    const collision = quantize120([segment(60, 0.0, 0.05), segment(62, 0.03, 0.5)]);
    expect(collision.notes.map((note) => note.midi)).toEqual([62]);
    expect(collision.dropped).toEqual([{ index: 0, reason: "COLLISION" }]);
  });

  it("returns nothing for no segments and rejects invalid settings", () => {
    expect(quantize120([])).toEqual({ notes: [], lengthTicks: 0, dropped: [] });
    expect(() => quantizeSegments([], { tempoBpm: 0, timeSignature: four })).toThrow(RangeError);
    expect(() => quantizeSegments([], { tempoBpm: 120, timeSignature: four, gridTicks: 250 })).toThrow(RangeError);
    expect(() => quantizeSegments([], { tempoBpm: 120, timeSignature: { numerator: 4, denominator: 3 } })).toThrow(RangeError);
    expect(() => quantizeSegments([], { tempoBpm: 120, timeSignature: four, downbeatSeconds: -1 })).toThrow(RangeError);
  });
});

describe("transcriptionToClipboard", () => {
  const notes = quantize120([segment(60, 0, 0.5), segment(65, 1.0, 1.5), segment(70, 1.75, 2.75)]);

  it("builds note and rest events with fresh IDs, key spelling and transcription provenance", () => {
    const clipboard = transcriptionToClipboard(notes, { key: keyOf("F 장조"), timeSignature: four, nextId: ids() });
    expect(clipboard.lengthTicks).toBe(2.75 * 2 * Q);
    expect(clipboard.ties).toEqual([]);
    expect(clipboard.events.map((event) => [event.kind, event.startTick, event.durationTicks])).toEqual([
      ["note", 0, 960], ["rest", 960, 960], ["note", 1920, 960], ["rest", 2880, 480], ["note", 3360, 1920]]);
    const last = clipboard.events.at(-1) as NoteEvent;
    expect(last.pitch).toEqual({ midi: 70, step: "B", alter: -1, octave: 4 });
    expect(last.provenance).toEqual({ source: "transcription", confidence: 0.9 });
    expect(new Set(clipboard.events.map((event) => event.id)).size).toBe(5);
  });

  it("splits rests at barlines so the payload pastes at a measure start; notes are left for paste to split", () => {
    const sparse = quantize120([segment(60, 0, 0.5), segment(62, 3.0, 3.5)]);
    const clipboard = transcriptionToClipboard(sparse, { key: keyOf("C 장조"), timeSignature: four, nextId: ids() });
    const rests = clipboard.events.filter((event) => event.kind === "rest").map((event) => [event.startTick, event.durationTicks]);
    expect(rests).toEqual([[960, 2880], [3840, 1920]]);
  });

  it("pastes into an empty score as one command and the result validates", () => {
    const score = createEmptyScore({ id: "s", measureCount: 2, keySignature: keyOf("F 장조"), createdAt: "2026-11-13T00:00:00.000Z" });
    const clipboard = transcriptionToClipboard(notes, { key: keyOf("F 장조"), timeSignature: four, nextId: ids() });
    const result = applyEditCommand(score, { type: "PasteEvents", partId: score.parts[0].id, startTick: 0, clipboard });
    expect(result.ok).toBe(true);
    const pasted = (result as { score: Score }).score;
    expect(validateScore(pasted)).toEqual([]);
    // The last note (tick 3360, 1920 long) crosses the barline at 3840, so PasteEvents splits it and adds one tie.
    expect(pasted.parts[0].ties).toHaveLength(1);
  });

  it("returns an empty payload for no notes", () => {
    expect(transcriptionToClipboard({ notes: [], lengthTicks: 0, dropped: [] }, { key: keyOf("C 장조"), timeSignature: four, nextId: ids() }))
      .toEqual({ lengthTicks: 0, events: [], ties: [] });
  });
});

/**
 * End to end on the 40 synthetic cases: PCM → pitch → segments → grid → candidate payload → paste.
 * Floors fixed before implementation. Scored on ticks with the C-09 scorer (same MIDI, same onset, tolerance 0).
 */
describe("transcription of the synthetic humming set", () => {
  it("meets the note-level floors and every candidate pastes into an empty score", () => {
    const scores: TranscriptionScore[] = [];
    const failures: string[] = [];
    for (const item of hummingCases()) {
      const clip = item.render();
      const { tempoBpm, timeSignature, notes: reference } = item.melody;
      const quantized = quantizeSegments(segmentNotes(estimatePitchTrack(clip.samples, clip.sampleRate)),
        { tempoBpm, timeSignature, downbeatSeconds: clip.downbeatSeconds });
      scores.push(scoreTranscription(reference, quantized.notes));
      const key = keyOf("C 장조");
      const measures = Math.max(1, Math.ceil(quantized.lengthTicks / measureTicks(timeSignature)));
      const empty = createEmptyScore({ id: item.id, tempoBpm, timeSignature, keySignature: key, measureCount: measures,
        createdAt: "2026-11-13T00:00:00.000Z" });
      const clipboard = transcriptionToClipboard(quantized, { key, timeSignature, nextId: ids() });
      const pasted = applyEditCommand(empty, { type: "PasteEvents", partId: empty.parts[0].id, startTick: 0, clipboard });
      if (!pasted.ok || validateScore(pasted.score).length > 0) failures.push(item.id);
    }
    const total = aggregateTranscriptionScores(scores);
    const report = JSON.stringify({ ...total, durationMatchRate: total.durationMatches / total.truePositives, failures });
    expect(total.f1, report).toBeGreaterThanOrEqual(0.95);
    expect(total.octaveErrors, report).toBe(0);
    expect(total.durationMatches / total.truePositives, report).toBeGreaterThanOrEqual(0.9);
    expect(failures, report).toEqual([]);
  }, 60_000);
});
