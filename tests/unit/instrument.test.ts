import { describe, expect, it } from "vitest";
import { applyEditCommand } from "@/domain/commands";
import {
  createEmptyScore, deserializeScore, getInstrumentProfile, listedInstruments, INSTRUMENT_IDS, instrumentOf, SCORE_SCHEMA_VERSION,
  serializeScore, validateScore, type Score,
} from "@/domain/score";
import { fourNoteScore, tiedScore } from "../../tests/fixtures/scores";

const at = "2026-11-14T00:00:00.000Z";
/** A stored v2 document exactly as v2 wrote it: no `instrument` on any part. */
function v2Json(score: Score): string {
  return JSON.stringify({
    ...score, schemaVersion: 2,
    parts: score.parts.map((part) => Object.fromEntries(Object.entries(part).filter(([key]) => key !== "instrument"))),
  });
}
const withoutInstrument = (part: object) => Object.fromEntries(Object.entries(part).filter(([key]) => key !== "instrument"));
const pitches = (score: Score) => score.parts[0].measures.flatMap((measure) => measure.events)
  .map((event) => (event.kind === "note" ? event.pitch : null));

describe("Phase 7 B-2: Part.instrument and schemaVersion 3 (decision 6)", () => {
  it("writes schemaVersion 3, and a new score is for the piano", () => {
    expect(SCORE_SCHEMA_VERSION).toBe(3);
    const score = createEmptyScore({ id: "s", createdAt: at });
    expect(score.schemaVersion).toBe(3);
    expect(score.parts[0].instrument).toBe("piano");
    expect(validateScore(score)).toEqual([]);
  });

  it("opens a v2 document as the piano, keeping everything else (ties included)", () => {
    const source = tiedScore();
    const result = deserializeScore(v2Json(source));
    expect(result).toMatchObject({ ok: true, migrated: true });
    if (!result.ok) return;
    expect(result.score.schemaVersion).toBe(3);
    expect(result.score.parts.map((part) => part.instrument)).toEqual(["piano"]);
    expect(result.score.parts[0].ties).toEqual(source.parts[0].ties);
    expect({ ...result.score, parts: result.score.parts.map(withoutInstrument) })
      .toEqual({ ...source, schemaVersion: 3, parts: source.parts.map(withoutInstrument) });
  });

  it("still opens a v1 document: empty ties and the piano", () => {
    const parts = fourNoteScore().parts.map((part) => Object.fromEntries(Object.entries(part)
      .filter(([key]) => key !== "ties" && key !== "instrument")));
    const result = deserializeScore(JSON.stringify({ ...fourNoteScore(), schemaVersion: 1, parts }));
    expect(result).toMatchObject({ ok: true, migrated: true, score: { schemaVersion: 3, parts: [{ ties: [], instrument: "piano" }] } });
  });

  it("round-trips each instrument in v3 without migrating", () => {
    for (const instrument of INSTRUMENT_IDS) {
      const score = createEmptyScore({ id: `s-${instrument}`, createdAt: at });
      const chosen: Score = { ...score, parts: score.parts.map((part) => ({ ...part, instrument })) };
      const result = deserializeScore(serializeScore(chosen));
      expect(result).toEqual({ ok: true, score: chosen, migrated: false });
    }
  });

  it("protects against an unknown or malformed instrument", () => {
    const score = createEmptyScore({ id: "s", createdAt: at });
    const unknown = JSON.stringify({ ...score, parts: score.parts.map((part) => ({ ...part, instrument: "violin" })) });
    expect(deserializeScore(unknown)).toMatchObject({ ok: false, code: "INVALID_SCORE" });
    const malformed = JSON.stringify({ ...score, parts: score.parts.map((part) => ({ ...part, instrument: 7 })) });
    expect(deserializeScore(malformed)).toMatchObject({ ok: false, code: "INVALID_SHAPE" });
    // A v2 document never had an instrument, so one appearing there is not trusted either.
    expect(deserializeScore(JSON.stringify({ ...JSON.parse(unknown), schemaVersion: 2 }))).toMatchObject({ ok: false });
  });

  it("treats a v3 part without the field as the piano", () => {
    const score = createEmptyScore({ id: "s", createdAt: at });
    expect(instrumentOf(withoutInstrument(score.parts[0]) as typeof score.parts[0])).toBe("piano");
    expect(instrumentOf(score.parts[0])).toBe("piano");
  });

  it("SetInstrument changes only the instrument: one command, notes untouched", () => {
    const source = fourNoteScore();
    const result = applyEditCommand(source, { type: "SetInstrument", partId: source.parts[0].id, instrument: "gayageum-25", updatedAt: at });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score.parts[0].instrument).toBe("gayageum-25");
    expect(result.score.updatedAt).toBe(at);
    expect(pitches(result.score)).toEqual(pitches(source));
    expect(result.score.parts[0].clef).toBe(source.parts[0].clef);
    expect(applyEditCommand(source, { type: "SetInstrument", partId: source.parts[0].id, instrument: "violin" as never, updatedAt: at }))
      .toMatchObject({ ok: false, error: { code: "INVALID_INSTRUMENT" } });
    expect(applyEditCommand(source, { type: "SetInstrument", partId: "missing", instrument: "piano", updatedAt: at }))
      .toMatchObject({ ok: false, error: { code: "PART_NOT_FOUND" } });
  });

  it("SetClef changes only the clef: one command, pitches and positions untouched", () => {
    const source = fourNoteScore();
    const result = applyEditCommand(source, { type: "SetClef", partId: source.parts[0].id, clef: "bass", updatedAt: at });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score.parts[0].clef).toBe("bass");
    expect(result.score.parts[0].measures).toEqual(source.parts[0].measures);
    expect(applyEditCommand(source, { type: "SetClef", partId: source.parts[0].id, clef: "alto" as never, updatedAt: at }))
      .toMatchObject({ ok: false, error: { code: "INVALID_CLEF" } });
  });

  it("profiles: the piano; 산조대금 from published sources; 향피리 retired but still readable", () => {
    expect(getInstrumentProfile("piano")).toMatchObject({ name: "피아노", verified: true, range: { lowMidi: 21, highMidi: 108 } });
    // User decision 2026-11-15: 산조대금 replaces 향피리, values from published sources (docs/INSTRUMENTS.md):
    // 6관 본청 (전폐음 C4) up to 중청태주 a tone above 정악대금's F-equivalent: C4–F6, sounding pitch, one treble staff.
    expect(getInstrumentProfile("daegeum-sanjo")).toMatchObject({ name: "산조대금", verified: true, listed: true,
      range: { lowMidi: 60, highMidi: 89, label: "C4–F6" }, tunings: [], grandStaff: false });
    // A stored "hyang-piri" part still opens (schema v3 compatibility); the piri is just never offered.
    expect(getInstrumentProfile("hyang-piri")).toMatchObject({ name: "향피리", verified: false, listed: false, range: null, tunings: [] });
    expect(listedInstruments().map((profile) => profile.id)).toEqual(["piano", "gayageum-25", "gayageum-12-sanjo", "daegeum-sanjo"]);
  });

  it("25현 가야금 carries the expert-confirmed values (B-1, 2026-11-15): Eb2–Ab5, Eb조 and Ab조, sounding pitch", () => {
    const gayageum = getInstrumentProfile("gayageum-25");
    expect(gayageum).toMatchObject({ name: "25현 가야금", verified: true, range: { lowMidi: 39, highMidi: 80 } });
    // Strings 1–25, lowest first: the E-flat major scale from Eb2 up to Ab5.
    const eb = [39, 41, 43, 44, 46, 48, 50, 51, 53, 55, 56, 58, 60, 62, 63, 65, 67, 68, 70, 72, 74, 75, 77, 79, 80];
    expect(gayageum.tunings.map((tuning) => [tuning.id, tuning.name, tuning.stringMidis])).toEqual([
      ["eb", "Eb조", eb],
      // Ab조: the three D strings lowered to D-flat, everything else as in Eb조.
      ["ab", "Ab조", eb.map((midi) => (midi % 12 === 2 ? midi - 1 : midi))],
    ]);
    for (const tuning of gayageum.tunings) {
      expect(tuning.stringMidis).toHaveLength(25);
      expect(tuning.stringMidis[0]).toBe(gayageum.range!.lowMidi);
      expect(tuning.stringMidis[24]).toBe(gayageum.range!.highMidi);
      expect([...tuning.stringMidis].sort((a, b) => a - b)).toEqual(tuning.stringMidis);
    }
    expect(gayageum.tunings[1].stringMidis.filter((midi, index) => midi !== eb[index])).toEqual([49, 61, 73]);
  });

  it("12현 산조가야금 carries the 국립국악원 국악사전 open-string tuning at sounding pitch (2026-11-15)", () => {
    const sanjo = getInstrumentProfile("gayageum-12-sanjo");
    // Strings 1–12, lowest first: G2 C3 D3 G3 A3 C4 D4 E4 G4 A4 C5 D5 (실음).
    const open = [43, 48, 50, 55, 57, 60, 62, 64, 67, 69, 72, 74];
    expect(sanjo).toMatchObject({ name: "12현 산조가야금", verified: true, range: { lowMidi: 43, highMidi: 74 } });
    expect(sanjo.tunings.map((tuning) => [tuning.id, tuning.name, tuning.stringMidis])).toEqual([["sanjo", "산조 조율", open]]);
    expect(INSTRUMENT_IDS).toContain("gayageum-12-sanjo");
    // 정악(풍류)가야금 is not offered for now (user decision 2026-11-15).
    expect(INSTRUMENT_IDS).toHaveLength(5);
  });
});
