import { describe, expect, it } from "vitest";
import { readMidiImport, writeMidi } from "@/adapters/midi";
import { buildImportedScore } from "@/application";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { createNoteEvent } from "@/domain/score";
import type { ImportedScore } from "@/domain/score";
import { makeSmf, text, vlq } from "../fixtures/smf-builder";

function read(bytes: Uint8Array): ImportedScore {
  const result = readMidiImport(bytes);
  if (!result.ok) throw new Error(result.message);
  return result.score;
}
const failure = (bytes: Uint8Array) => { const result = readMidiImport(bytes); return result.ok ? "ok" : result.message; };
const spelled = (pitch: { step: string; alter: number; octave: number } | null) =>
  pitch ? `${pitch.step}${pitch.alter === 1 ? "#" : pitch.alter === -1 ? "b" : ""}${pitch.octave}` : "rest";

describe("readMidiImport (Phase 8 step 3)", () => {
  it("round trip of the app's own MIDI", () => {
    const key = KEY_SIGNATURE_OPTIONS.find((option) => option.id === "major:-3")!.key;
    const pitches: [string, number, number][] = [["E", -1, 4], ["G", 0, 3], ["B", -1, 4], ["C", 0, 5], ["A", -1, 3]];
    const events = pitches.map(([step, alter, octave], index) => createNoteEvent({ id: `n${index}`, step: step as "C", alter, octave, startTick: index * 960, durationTicks: 960 }));
    let id = 0;
    const built = buildImportedScore({ id: "rt", createdAt: "2026-11-16T00:00:00.000Z", nextId: () => `m${(id += 1)}`,
      settings: { title: "왕복", tempoBpm: 96, timeSignature: { numerator: 3, denominator: 4 }, keySignature: key },
      clipboard: { lengthTicks: 5760, events, ties: [] }, instrument: "gayageum-25", transpose: null });
    if (!built.ok) throw new Error(built.message);
    const score = read(writeMidi(built.score));
    expect(score.title).toBe("왕복");
    expect(score.tempos).toEqual([{ tick: 0, bpm: 96 }]);
    const part = score.parts[0]!;
    expect(part.timeSignatures[0]).toMatchObject({ tick: 0, numerator: 3, denominator: 4 });
    expect(part.keys[0]).toMatchObject({ tick: 0, fifths: -3, mode: "major" });
    expect(part.notes.map((note) => [spelled(note.pitch), note.startTick, note.durationTicks])).toEqual(
      events.map((event, index) => [`${pitches[index]![0]}${pitches[index]![1] === -1 ? "b" : ""}${pitches[index]![2]}`, event.startTick, 960]));
    expect(score.parts).toHaveLength(1);
  });

  it("reads running status and velocity-0 note offs", () => {
    // division 480: C4 quarter, D4 quarter via running status with velocity 0 offs.
    const track = [0, 0x90, 60, 100, ...vlq(480), 60, 0, 0, 62, 100, ...vlq(480), 62, 0];
    const part = read(makeSmf({ format: 0, tracks: [track] })).parts[0]!;
    expect(part.notes.map((note) => [note.pitch?.step, note.startTick, note.durationTicks])).toEqual([["C", 0, 960], ["D", 960, 960]]);
  });

  it("pairs overlapping same notes first in, first out", () => {
    const track = [0, 0x90, 64, 90, ...vlq(240), 0x90, 64, 90, ...vlq(240), 0x80, 64, 0, ...vlq(480), 0x80, 64, 0];
    const part = read(makeSmf({ format: 0, tracks: [track] })).parts[0]!;
    expect(part.notes.map((note) => [note.startTick, note.durationTicks])).toEqual([[0, 960], [480, 1440]]);
  });

  it("format 0 channels become parts and drums are counted", () => {
    const track = [0, 0x90, 72, 100, 0, 0x91, 48, 100, 0, 0x99, 36, 100, ...vlq(480), 0x80, 72, 0, 0, 0x81, 48, 0, 0, 0x89, 36, 0];
    const score = read(makeSmf({ format: 0, tracks: [[...text(0x03, "Song"), ...track]] }));
    expect(score.parts.map((part) => part.name)).toEqual(["Song · 채널 1", "Song · 채널 2"]);
    expect(score.parts.map((part) => part.notes.length)).toEqual([1, 1]);
    expect(score.ignored.drums).toBe(1);
  });

  it("spells with the key meta and leaves keys empty without one", () => {
    const note = [0, 0x90, 66, 100, ...vlq(480), 0x80, 66, 0];
    const sharp = read(makeSmf({ format: 0, tracks: [[0, 0xff, 0x59, 2, 2, 0, ...note]] })).parts[0]!;
    expect(spelled(sharp.notes[0]!.pitch)).toBe("F#4");
    const flat = read(makeSmf({ format: 0, tracks: [[0, 0xff, 0x59, 2, 0xfa, 0, ...note]] })).parts[0]!;
    expect(spelled(flat.notes[0]!.pitch)).toBe("Gb4");
    expect(flat.keys[0]).toMatchObject({ fifths: -6, mode: "major" });
    const none = read(makeSmf({ format: 0, tracks: [note] })).parts[0]!;
    expect(none.keys).toEqual([]);
  });

  it("names parts and the title from track names, and builds measures", () => {
    const conductor = [...text(0x03, "My Song"), 0, 0xff, 0x58, 4, 3, 2, 24, 8, 0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20];
    const melody = [...text(0x04, "Flute"), 0, 0x90, 67, 100, ...vlq(480 * 7), 0x80, 67, 0];
    const score = read(makeSmf({ tracks: [conductor, melody] }));
    expect(score.title).toBe("My Song");
    expect(score.tempos).toEqual([{ tick: 0, bpm: 120 }]);
    expect(score.parts.map((part) => part.name)).toEqual(["Flute"]);
    const part = score.parts[0]!;
    expect(part.measures.map((measure) => [measure.number, measure.startTick, measure.lengthTicks])).toEqual([["1", 0, 2880], ["2", 2880, 2880], ["3", 5760, 2880]]);
  });

  it("rejects format 2, SMPTE, broken and non-MIDI files with exact messages", () => {
    expect(failure(makeSmf({ format: 2, tracks: [[]] }))).toBe("지원하지 않는 MIDI 형식(형식 2)입니다.");
    expect(failure(makeSmf({ division: 0xe728, tracks: [[]] }))).toBe("지원하지 않는 MIDI 시간 형식(SMPTE)입니다.");
    const whole = makeSmf({ tracks: [[0, 0x90, 60, 100, ...vlq(480), 0x80, 60, 0]] });
    expect(failure(whole.slice(0, whole.length - 6))).toBe("MIDI 파일로 읽을 수 없습니다.");
    expect(failure(new TextEncoder().encode("<score-partwise/>"))).toBe("MIDI 파일로 읽을 수 없습니다.");
  });

  it("accepts a track without an end-of-track meta", () => {
    const part = read(makeSmf({ format: 0, endOfTrack: false, tracks: [[0, 0x90, 60, 100, ...vlq(480), 0x80, 60, 0]] })).parts[0]!;
    expect(part.notes).toHaveLength(1);
  });
});

describe("readMidiImport review fixes", () => {
  it("uses the MIDI default of 120 BPM without a tempo meta", () => {
    expect(read(makeSmf({ format: 0, tracks: [[0, 0x90, 60, 100, ...vlq(480), 0x80, 60, 0]] })).tempos).toEqual([{ tick: 0, bpm: 120 }]);
  });

  it("reads many notes without spreading them into one call", () => {
    const track: number[] = [];
    for (let i = 0; i < 140_000; i += 1) track.push(0, 0x90, 60 + (i % 12), 90, 1, 0x80, 60 + (i % 12), 0);
    const result = readMidiImport(makeSmf({ format: 0, division: 960, tracks: [track] }));
    expect(result.ok && result.score.parts[0]!.notes.length).toBe(140_000);
  });

  it("stops building measures past the notation limit", () => {
    // One note held for a huge delta at division 1: millions of bars if counted out.
    const result = readMidiImport(makeSmf({ format: 0, division: 1, tracks: [[0, 0x90, 60, 100, ...vlq(0x0fffffff), 0x80, 60, 0]] }));
    expect(result.ok && result.score.parts[0]!.measures.length).toBeLessThanOrEqual(1025);
  });

  it("a one-bar 1/4 signature before 4/4 is a pickup", () => {
    const conductor = [0, 0xff, 0x58, 4, 1, 2, 24, 8, ...vlq(480), 0xff, 0x58, 4, 4, 2, 24, 8];
    const melody = [0, 0x90, 67, 100, ...vlq(480), 0x80, 67, 0, 0, 0x90, 72, 100, ...vlq(1920), 0x80, 72, 0];
    const part = read(makeSmf({ tracks: [conductor, melody] })).parts[0]!;
    expect(part.timeSignatures).toEqual([{ tick: 0, numerator: 4, denominator: 4 }]);
    expect(part.measures[0]).toMatchObject({ implicit: true, lengthTicks: 960 });
    expect(part.measures[1]).toMatchObject({ startTick: 960 });
  });
});
