import { describe, expect, it } from "vitest";
import { applyEditCommand } from "@/domain/commands";
import {
  createEmptyScore, deserializeScore, getInstrumentProfile, INSTRUMENT_IDS, instrumentOf, SCORE_SCHEMA_VERSION,
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

  it("profiles: the piano is known; 향피리·25현 values wait for B-1 and are not filled with unverified numbers", () => {
    expect(getInstrumentProfile("piano")).toMatchObject({ name: "피아노", verified: true, range: { lowMidi: 21, highMidi: 108 } });
    for (const id of ["hyang-piri", "gayageum-25"] as const) {
      const profile = getInstrumentProfile(id);
      expect(profile.verified).toBe(false);
      expect(profile.range).toBeNull();
      expect(profile.tunings).toEqual([]);
    }
    expect(getInstrumentProfile("hyang-piri").name).toBe("향피리");
    expect(getInstrumentProfile("gayageum-25").name).toBe("25현 가야금");
  });
});
