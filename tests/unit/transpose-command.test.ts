import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEditCommand, type EditCommand } from "@/domain/commands";
import { applyCommand, createEditSession, undo, redo } from "@/application/edit-session";
import { KEY_SIGNATURE_OPTIONS, createPitch } from "@/domain/music-theory";
import * as engine from "@/domain/score/transpose";
import { createNoteEvent, createRestEvent, deserializeScore, serializeScore, validateScore } from "@/domain/score";
import type { KeySignature, Pitch, Score } from "@/domain/score";
import { createScoreStore } from "@/store/score-store";
import { baseScore, fourNoteScore, tiedScore, withMeasureEvents } from "../fixtures/scores";

const timestamp = "2026-11-08T04:00:00.000Z";
const later = "2026-11-08T05:00:00.000Z";
function key(name: string, mode = "major"): KeySignature {
  return { ...KEY_SIGNATURE_OPTIONS.find((option) => option.label.startsWith(`${name} `) && option.key.mode === mode)!.key };
}
function command(spec: engine.TransposeSpec = { kind: "targetKey", targetKey: key("D") }, updatedAt = timestamp): EditCommand {
  return { type: "TransposeScore", spec, updatedAt };
}
function successful(score: Score, edit = command()): Score {
  const result = applyEditCommand(score, edit);
  if (!result.ok) throw new Error(result.error.message);
  return result.score;
}
function pitches(score: Score): Pitch[] {
  return score.parts.flatMap((part) => part.measures.flatMap((measure) => measure.events.flatMap((event) => event.kind === "note" ? [event.pitch] : [])));
}
function freeze<T>(object: T): T {
  if (object && typeof object === "object") { Object.values(object).forEach(freeze); Object.freeze(object); }
  return object;
}
afterEach(() => vi.restoreAllMocks());

describe("TransposeScore command", () => {
  it.each(["D", "C#", "Db"])("reuses the engine for the explicit target %s and injects only the supplied timestamp", (name) => {
    const source = freeze(fourNoteScore()); const spec: engine.TransposeSpec = { kind: "targetKey", targetKey: key(name) };
    const expected = engine.transposeScore(source, spec);
    if (!expected.ok) throw new Error(expected.error.message);
    const run = vi.spyOn(engine, "transposeScore");
    const changed = successful(source, command(spec));
    expect(run).toHaveBeenCalledExactlyOnceWith(source, spec);
    expect(changed).toEqual({ ...expected.value.score, updatedAt: timestamp });
    expect(changed.parts[0].keySignature).toEqual(key(name)); expect(validateScore(changed)).toEqual([]);
    expect(changed.schemaVersion).toBe(2); expect(source.updatedAt).not.toBe(timestamp);
  });
  it.each(["nearest", "up", "down"] as const)("forwards the approved direction %s unchanged", (direction) => {
    const source = fourNoteScore(); const spec: engine.TransposeSpec = { kind: "targetKey", targetKey: key("B"), direction };
    const expected = engine.transposeScore(source, spec);
    if (!expected.ok) throw new Error(expected.error.message);
    expect(successful(source, command(spec))).toEqual({ ...expected.value.score, updatedAt: timestamp });
  });
  it("preserves ties/rests/metadata through exact snapshot undo and redo", () => {
    const source = tiedScore();
    source.parts[0].measures[0].events.unshift(createRestEvent({ id: "rest", startTick: 0, durationTicks: 480 }));
    const note = source.parts[0].measures[0].events[1];
    if (note.kind !== "note") throw new Error("fixture");
    note.velocity = 66; note.provenance = { source: "transcription", confidence: 0.91 };
    const before = serializeScore(source); freeze(source);
    const initial = createEditSession(source); const applied = applyCommand(initial, command());
    expect(applied.result.ok).toBe(true); expect(applied.session.past).toEqual([source]);
    expect(applied.session.future).toEqual([]); expect(applied.session.current.parts[0].ties).toBe(source.parts[0].ties);
    expect(pitches(applied.session.current)).toEqual([createPitch("D", 0, 4), createPitch("D", 0, 4)]);
    const transformed = applied.session;
    for (let i = 0; i < 3; i++) {
      const reverted = undo(transformed);
      expect(reverted.current).toBe(source); expect(serializeScore(reverted.current)).toBe(before);
      expect(reverted.current.updatedAt).toBe(source.updatedAt);
      expect(redo(reverted).current).toBe(transformed.current);
      expect(redo(reverted).current.updatedAt).toBe(timestamp);
    }
    expect(serializeScore(source)).toBe(before);
  });
  it("10 Parts and 500 notes produce one engine call, one notification and one undo unit", () => {
    const source = baseScore(); const template = source.parts[0];
    source.parts = Array.from({ length: 10 }, (_, p) => ({ ...template, id: `part-${p}`,
      measures: template.measures.map((measure, m) => ({ ...measure, id: `p${p}:m${m}`,
        events: Array.from({ length: 50 }, (_, n) => createNoteEvent({ id: `p${p}:n${n}`, step: "C", octave: 4,
          startTick: n * 120, durationTicks: 120 })).filter((event) => Math.floor(event.startTick / 3840) === m) })) }));
    freeze(source); expect(validateScore(source)).toEqual([]);
    const store = createScoreStore(); store.init(source); const notify = vi.fn(); store.subscribe(notify);
    const run = vi.spyOn(engine, "transposeScore");
    expect(store.dispatch(command())?.ok).toBe(true); expect(run).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledTimes(1);
    const changed = store.getState()!; expect(changed.past).toEqual([source]); expect(changed.future).toEqual([]);
    expect(pitches(changed.current)).toHaveLength(500); expect(pitches(changed.current).every((pitch) => pitch.midi === 62)).toBe(true);
    store.undo(); expect(store.getState()!.current).toBe(source); store.redo(); expect(store.getState()!.current).toBe(changed.current);
  });
  it("keeps JSON serialization envelope-free and compatible with schemaVersion 2", () => {
    const changed = successful(tiedScore()); const json = serializeScore(changed);
    expect(JSON.parse(json)).toEqual(changed); expect(JSON.parse(json)).not.toHaveProperty("revision");
    expect(deserializeScore(json)).toEqual({ ok: true, score: changed, migrated: false });
  });
});

describe("semantic no-op", () => {
  it.each([
    { kind: "semitones", semitones: 0 },
    { kind: "targetKey", targetKey: key("C") },
  ] satisfies engine.TransposeSpec[])("returns the original snapshot and preserves the redo branch (%#)", (spec) => {
    const source = freeze(fourNoteScore());
    const withRedo = undo(applyCommand(createEditSession(source), command()).session);
    const outcome = applyCommand(withRedo, command(spec, later));
    expect(outcome.result).toEqual({ ok: true, score: source }); expect(outcome.session).toBe(withRedo);
    expect(outcome.session.current.updatedAt).toBe(source.updatedAt); expect(outcome.session.past).toBe(withRedo.past);
    expect(outcome.session.future).toBe(withRedo.future); expect(redo(outcome.session).current.updatedAt).toBe(timestamp);
  });
  it.each([baseScore(), withMeasureEvents(baseScore(), [createRestEvent({ id: "r", startTick: 0, durationTicks: 960 })])])(
    "recognizes empty/rest-only octave moves as no-op despite cloned engine output (%#)", (source) => {
      // Property insertion order and metadata must not be mistaken for musical changes.
      source.parts[0].keySignature = { fifths: 0, mode: "major", alter: 0, tonic: "C" };
      const spec: engine.TransposeSpec = { kind: "semitones", semitones: 12 };
      const calculated = engine.transposeScore(source, spec);
      if (!calculated.ok) throw new Error(calculated.error.message);
      expect(calculated.value.score).not.toBe(source);
      const session = createEditSession(freeze(source)); const outcome = applyCommand(session, command(spec));
      expect(outcome.session).toBe(session); expect(outcome.result).toEqual({ ok: true, score: source });
    },
  );
  it("does not notify the store for no-op success or failed transpose", () => {
    const source = fourNoteScore(); const store = createScoreStore(); store.init(source);
    const before = store.getState(); const notify = vi.fn(); store.subscribe(notify);
    expect(store.dispatch(command({ kind: "semitones", semitones: 0 }))?.ok).toBe(true);
    expect(store.dispatch(command({ kind: "semitones", semitones: NaN }))?.ok).toBe(false);
    expect(store.getState()).toBe(before); expect(notify).not.toHaveBeenCalled();
  });
  it("treats zero-semitone enharmonic key/spelling changes as a real single edit", () => {
    const source = withMeasureEvents(baseScore(), [createNoteEvent({ id: "bsharp", step: "B", alter: 1, octave: 4, startTick: 0, durationTicks: 960 })]);
    source.parts[0].keySignature = key("C#"); freeze(source);
    const result = applyCommand(createEditSession(source), command({ kind: "targetKey", targetKey: key("Db") }));
    expect(result.session.past).toEqual([source]); expect(result.session.current.updatedAt).toBe(timestamp);
    expect(pitches(result.session.current)).toEqual([createPitch("C", 0, 5)]);
    expect(pitches(result.session.current)[0].midi).toBe(pitches(source)[0].midi);
    expect(result.session.current.parts[0].keySignature).toEqual(key("Db"));
    expect(undo(result.session).current).toBe(source); expect(redo(undo(result.session)).current).toBe(result.session.current);
  });
  it("an enharmonic key change is a real edit even when there are no notes", () => {
    const source = baseScore(); source.parts[0].keySignature = key("C#");
    const outcome = applyCommand(createEditSession(source), command({ kind: "targetKey", targetKey: key("Db") }));
    expect(outcome.session.past).toEqual([source]); expect(outcome.session.current.updatedAt).toBe(timestamp);
    expect(outcome.session.current.parts[0].keySignature).toEqual(key("Db"));
    expect(pitches(outcome.session.current)).toEqual([]); expect(undo(outcome.session).current).toBe(source);
  });
  it("records real edits even when the caller supplies the existing timestamp", () => {
    const source = fourNoteScore(); const outcome = applyCommand(createEditSession(source), command(undefined, source.updatedAt));
    expect(outcome.session.past).toHaveLength(1); expect(pitches(outcome.session.current)).not.toEqual(pitches(source));
    expect(outcome.session.current.updatedAt).toBe(source.updatedAt);
  });
});

describe("mixed history sequences", () => {
  it("AddNote → Transpose → Undo → Undo → Redo → Redo restores each exact snapshot", () => {
    const source = baseScore(); let session = createEditSession(source);
    session = applyCommand(session, { type: "AddNote", partId: source.parts[0].id, measureId: source.parts[0].measures[0].id,
      note: createNoteEvent({ id: "c", step: "C", octave: 4, startTick: 0, durationTicks: 960 }) }).session;
    const added = session.current; session = applyCommand(session, command()).session; const transposed = session.current;
    expect(session.past).toHaveLength(2); expect(pitches(transposed)).toEqual([createPitch("D", 0, 4)]);
    session = undo(session); expect(session.current).toBe(added);
    session = undo(session); expect(session.current).toBe(source);
    session = redo(session); expect(session.current).toBe(added);
    session = redo(session); expect(session.current).toBe(transposed);
  });
  it("SetKeySignature keeps pitches while TransposeScore changes them, then undo/redo restores both", () => {
    const source = fourNoteScore(); let session = applyCommand(createEditSession(source), {
      type: "SetKeySignature", partId: source.parts[0].id, keySignature: key("G"), updatedAt: timestamp,
    }).session;
    const keyOnly = session.current; expect(pitches(keyOnly)).toEqual(pitches(source));
    session = applyCommand(session, command({ kind: "targetKey", targetKey: key("A") }, later)).session;
    const transposed = session.current; expect(pitches(transposed)).toEqual(pitches(source).map((pitch) => createPitch(
      ({ C: "D", D: "E", E: "F", G: "A" } as const)[pitch.step as "C" | "D" | "E" | "G"], pitch.step === "E" ? 1 : 0, 4)));
    session = undo(session); expect(session.current).toBe(keyOnly); expect(session.current.updatedAt).toBe(timestamp);
    session = redo(session); expect(session.current).toBe(transposed); expect(session.current.updatedAt).toBe(later);
  });
  it("transpose → same-content request → one undo returns to the original", () => {
    const source = fourNoteScore(); const transposed = applyCommand(createEditSession(source), command()).session;
    const same = applyCommand(transposed, command(undefined, later));
    expect(same.session).toBe(transposed); expect(undo(same.session).current).toBe(source);
  });
  it("transpose → undo → failed request → redo preserves the transformed snapshot", () => {
    const source = fourNoteScore(); const transposed = applyCommand(createEditSession(source), command()).session;
    const reverted = undo(transposed); const failed = applyCommand(reverted, command({ kind: "targetKey", targetKey: key("D", "minor") }));
    expect(failed.result.ok).toBe(false); expect(failed.session).toBe(reverted); expect(redo(failed.session).current).toBe(transposed.current);
  });
  it("a real new transpose after undo clears the redo branch", () => {
    const source = fourNoteScore(); const reverted = undo(applyCommand(createEditSession(source), command()).session);
    const changed = applyCommand(reverted, command({ kind: "targetKey", targetKey: key("Eb") })).session;
    expect(changed.future).toEqual([]); expect(changed.past).toEqual([source]); expect(redo(changed)).toBe(changed);
  });
});

describe("atomic failures", () => {
  const upper = withMeasureEvents(baseScore(), [createNoteEvent({ id: "upper", step: "G", octave: 9, startTick: 0, durationTicks: 960 })]);
  const lower = withMeasureEvents(baseScore(), [createNoteEvent({ id: "lower", step: "C", octave: 0, startTick: 0, durationTicks: 960 })]);
  it.each([
    [upper, { kind: "semitones", semitones: 1 }, "MIDI_OUT_OF_RANGE"],
    [lower, { kind: "semitones", semitones: -13 }, "MIDI_OUT_OF_RANGE"],
    [lower, { kind: "semitones", semitones: -12 }, "PITCH_NOT_REPRESENTABLE"],
    [fourNoteScore(), { kind: "targetKey", targetKey: { ...key("C"), fifths: 99 } }, "UNSUPPORTED_KEY_SIGNATURE"],
    [fourNoteScore(), { kind: "targetKey", targetKey: key("D", "minor") }, "MODE_CHANGE_NOT_SUPPORTED"],
    [fourNoteScore(), { kind: "semitones", semitones: NaN }, "INVALID_TRANSPOSE"],
    [{ ...fourNoteScore(), schemaVersion: 999 }, { kind: "semitones", semitones: 0 }, "INVALID_SCORE"],
  ] as [Score, engine.TransposeSpec, string][])("keeps score/past/future/timestamp unchanged on %s (%#)", (source, spec, code) => {
    const session = freeze({ current: source, past: [baseScore()], future: [fourNoteScore()] });
    const before = JSON.stringify(session); const result = applyCommand(session, command(spec));
    expect(result.result).toMatchObject({ ok: false, error: { code } }); expect(result.result).not.toHaveProperty("score");
    expect(result.session).toBe(session); expect(result.session.past).toBe(session.past); expect(result.session.future).toBe(session.future);
    expect(JSON.stringify(result.session)).toBe(before);
  });
  it("later-Part failure cannot publish an earlier Part or clear the redo branch", () => {
    const source = fourNoteScore(); const part = upper.parts[0];
    source.parts.push({ ...part, id: "second", measures: part.measures.map((measure, i) => ({ ...measure, id: `second-m${i}`,
      events: measure.events.map((event) => ({ ...event, id: "second-upper" })) })) });
    const session = freeze({ current: source, past: [baseScore()], future: [tiedScore()] });
    const before = serializeScore(source); const failed = applyCommand(session, command());
    expect(failed.result).toMatchObject({ ok: false, error: { code: "MIDI_OUT_OF_RANGE" } });
    expect(failed.session).toBe(session); expect(serializeScore(source)).toBe(before);
  });
});
