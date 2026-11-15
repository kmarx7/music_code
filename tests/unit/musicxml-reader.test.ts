import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeXmlBytes, readMusicXml } from "@/adapters/musicxml";
import type { ImportedScore } from "@/domain/score";
import { parseXmlLite } from "../fixtures/xml-lite";

const fixture = (name: string) => readFileSync(join(__dirname, "../fixtures/musicxml-import", name), "utf8");
function read(text: string): ImportedScore {
  const result = readMusicXml(parseXmlLite(text));
  if (!result.ok) throw new Error(result.message);
  return result.score;
}

describe("readMusicXml (Phase 8 step 1)", () => {
  it("reads title, tempo, time and key", () => {
    const score = read(fixture("simple-melody.musicxml"));
    expect(score.title).toBe("아리랑 연습");
    expect(score.tempos).toEqual([{ tick: 0, bpm: 100 }]);
    const part = score.parts[0]!;
    expect(part.timeSignatures[0]).toEqual({ tick: 0, numerator: 4, denominator: 4 });
    expect(part.keys[0]).toMatchObject({ tick: 0, fifths: 1, mode: "major", nonStandard: false });
    expect(part.notes[0]).toMatchObject({ startTick: 0, durationTicks: 960, pitch: { step: "G", alter: 0, octave: 4 } });
    expect(part.notes).toHaveLength(12);
    expect(part.measures.map((measure) => measure.startTick)).toEqual([0, 3840, 7680, 11520]);
  });

  it("backup and chords place notes in time", () => {
    const part = read(fixture("piano-two-staves.musicxml")).parts[0]!;
    expect(part.staves).toBe(2);
    const left = part.notes.find((note) => note.staff === 2)!;
    expect(left).toMatchObject({ startTick: 0, pitch: { step: "C", octave: 3 } });
    const [first, second] = part.notes;
    expect(second).toMatchObject({ chord: true, startTick: first!.startTick, pitch: { step: "C", octave: 5 } });
    expect(part.notes.find((note) => note.voice === "2" && note.pitch?.step === "G")).toMatchObject({ startTick: 960 });
  });

  it("divisions change mid-part", () => {
    const part = read(fixture("piano-two-staves.musicxml")).parts[0]!;
    const second = part.notes.filter((note) => note.measureNumber === "2");
    expect(second[0]).toMatchObject({ startTick: 3840, durationTicks: 960 });
    expect(part.measures[1]).toMatchObject({ startTick: 3840, lengthTicks: 3840 });
  });

  it("marks grace, cue, tuplets and ties", () => {
    const part = read(fixture("odd-rhythm.musicxml")).parts[0]!;
    expect(part.notes.filter((note) => note.grace)).toHaveLength(1);
    expect(part.notes.find((note) => note.grace)!.durationTicks).toBe(0);
    expect(part.notes.filter((note) => note.cue)).toHaveLength(1);
    const triplets = part.notes.slice(0, 3);
    expect(triplets.map((note) => note.durationTicks)).toEqual([320, 320, 320]);
    expect(triplets.map((note) => note.startTick)).toEqual([0, 320, 640]);
    expect(part.notes.filter((note) => note.tieStart)).toHaveLength(1);
    expect(part.notes.filter((note) => note.tieStop)).toHaveLength(1);
    expect(part.notes.find((note) => note.tieStop)).toMatchObject({ measureNumber: "2", startTick: 3840 });
  });

  it("records pickup, changes and ignored marks", () => {
    const score = read(fixture("pickup-and-changes.musicxml"));
    const part = score.parts[0]!;
    expect(part.measures[0]).toMatchObject({ number: "0", implicit: true, startTick: 0, lengthTicks: 960 });
    expect(part.timeSignatures).toEqual([
      { tick: 0, numerator: 4, denominator: 4 },
      { tick: 4800, numerator: 3, denominator: 4 },
    ]);
    expect(part.keys).toHaveLength(2);
    expect(part.keys[0]).toMatchObject({ fifths: 0, mode: "dorian" });
    expect(part.keys[1]).toMatchObject({ tick: 4800, fifths: 1, mode: "major" });
    expect(score.tempos).toEqual([{ tick: 0, bpm: 80 }, { tick: 4800, bpm: 120 }]);
    expect(score.ignored.repeats).toBeGreaterThanOrEqual(1);
    expect(score.ignored.lyrics).toBeGreaterThanOrEqual(1);
    expect(score.ignored.directions).toBeGreaterThanOrEqual(1);
  });

  it("rejects timewise and non-musicxml", () => {
    const code = (text: string) => { const result = readMusicXml(parseXmlLite(text)); return result.ok ? "ok" : result.code; };
    expect(code("<score-timewise><part-list/></score-timewise>")).toBe("TIMEWISE");
    expect(code("<html><body/></html>")).toBe("NOT_MUSICXML");
    expect(code("<score-partwise><part-list/></score-partwise>")).toBe("NO_PARTS");
  });
});

describe("decodeXmlBytes", () => {
  it("reads UTF-8 as is", () => {
    expect(decodeXmlBytes(new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><a>가</a>'))).toContain("<a>가</a>");
  });

  it("reads UTF-16 LE with a byte-order mark", () => {
    const text = "<a>가</a>";
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes[0] = 0xff; bytes[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) { const code = text.charCodeAt(i); bytes[2 + i * 2] = code & 0xff; bytes[3 + i * 2] = code >> 8; }
    expect(decodeXmlBytes(bytes)).toBe(text);
  });

  it("refuses other declared encodings", () => {
    expect(decodeXmlBytes(new TextEncoder().encode('<?xml version="1.0" encoding="Shift_JIS"?><a/>'))).toBeNull();
  });
});
