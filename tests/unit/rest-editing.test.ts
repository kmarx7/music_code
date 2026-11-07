import { describe, expect, it } from "vitest";
import { applyEditCommand, type EditCommand } from "@/domain/commands";
import { createRestEvent, createNoteEvent, validateScore, serializeScore } from "@/domain/score";
import type { Score } from "@/domain/score";
import { applyCommand, createEditSession, undo, redo, planAppendRest, planAppendNote } from "@/application";
import { baseScore, tiedScore, withMeasureEvents } from "../fixtures/scores";

function apply(score: Score, command: EditCommand): Score {
  const result = applyEditCommand(score, command);
  if (!result.ok) throw new Error(result.error.message);
  expect(validateScore(result.score)).toEqual([]);
  return result.score;
}

function insert(score: Score, startTick = 0, durationTicks = 960, id = "r1"): EditCommand {
  return { type: "InsertRest", partId: score.parts[0].id,
    measureId: score.parts[0].measures[Math.floor(startTick / 3840)]?.id ?? "missing",
    rest: createRestEvent({ id, startTick, durationTicks }) };
}

function update(score: Score, patch: { startTick?: number; durationTicks?: number }, restId = "r1"): EditCommand {
  return { type: "UpdateRest", partId: score.parts[0].id, restId, patch };
}

function events(score: Score) { return score.parts[0].measures.flatMap((m) => m.events); }

describe("rest commands — non-ripple editing", () => {
  it("inserts, changes duration, moves across measures and deletes a rest", () => {
    const initial = baseScore();
    let score = apply(initial, insert(initial));
    score = apply(score, update(score, { durationTicks: 480 }));
    score = apply(score, update(score, { startTick: 4320 }));
    expect(score.parts[0].measures[0].events).toEqual([]);
    expect(score.parts[0].measures[1].events[0]).toEqual(createRestEvent({ id: "r1", startTick: 4320, durationTicks: 480 }));
    score = apply(score, { type: "DeleteEvent", partId: score.parts[0].id, eventId: "r1" });
    expect(events(score)).toEqual([]);
    expect(events(initial)).toEqual([]);
  });

  it.each([0, -960, 1000, 1.5, NaN, Infinity])("rejects unnotatable duration %s for insert and update", (durationTicks) => {
    const initial = baseScore();
    const score = apply(initial, insert(initial));
    for (const [source, command] of [[initial, insert(initial, 0, durationTicks)], [score, update(score, { durationTicks })]] as const) {
      const before = serializeScore(source);
      expect(applyEditCommand(source, command)).toMatchObject({ ok: false, error: { code: "NOT_NOTATABLE" } });
      expect(serializeScore(source)).toBe(before);
    }
  });

  it("accepts an exact measure end and rejects crossing it without splitting or shifting", () => {
    let score = baseScore();
    score = apply(score, insert(score, 2880));
    expect(applyEditCommand(score, update(score, { durationTicks: 1920 }))).toMatchObject({ ok: false, error: { code: "INVALID_SCORE" } });
    expect(applyEditCommand(baseScore(), insert(baseScore(), 3360))).toMatchObject({ ok: false });
    expect(events(score)[0].durationTicks).toBe(960);
  });

  it.each([-1, 0.5, NaN, Infinity, 7680])("rejects invalid/outside position %s", (startTick) => {
    const score = apply(baseScore(), insert(baseScore()));
    const before = serializeScore(score);
    expect(applyEditCommand(score, update(score, { startTick }))).toMatchObject({ ok: false });
    expect(serializeScore(score)).toBe(before);
  });

  it("rejects note/rest and rest/rest collisions; preserves other event positions on successful edits", () => {
    let score = withMeasureEvents(baseScore(), [createNoteEvent({ id: "n", step: "C", octave: 4, startTick: 0, durationTicks: 960 })]);
    score = apply(score, insert(score, 960));
    score = apply(score, insert(score, 2880, 960, "r2"));
    const before = serializeScore(score);
    for (const patch of [{ startTick: 480 }, { startTick: 2880 }, { durationTicks: 2880 }]) {
      expect(applyEditCommand(score, update(score, patch))).toMatchObject({ ok: false });
      expect(serializeScore(score)).toBe(before);
    }
    expect(applyEditCommand(score, insert(score, 0, 480, "collision"))).toMatchObject({ ok: false });
    const changed = apply(score, update(score, { durationTicks: 480 }));
    expect(events(changed).filter((e) => e.id !== "r1")).toEqual(events(score).filter((e) => e.id !== "r1"));
  });

  it("rejects duplicate IDs, missing part/rest/measure and attempts to update a note as a rest", () => {
    const score = apply(tiedScore(), insert(tiedScore(), 0));
    expect(applyEditCommand(score, insert(score))).toMatchObject({ ok: false, error: { code: "DUPLICATE_ID" } });
    expect(applyEditCommand(score, { type: "UpdateRest", partId: "missing", restId: "r1", patch: {} })).toMatchObject({ ok: false, error: { code: "PART_NOT_FOUND" } });
    expect(applyEditCommand(score, update(score, {}, "missing"))).toMatchObject({ ok: false, error: { code: "EVENT_NOT_FOUND" } });
    expect(applyEditCommand(score, update(score, {}, "t1"))).toMatchObject({ ok: false, error: { code: "EVENT_NOT_FOUND" } });
    expect(applyEditCommand(score, { type: "InsertRest", partId: score.parts[0].id, measureId: "missing", rest: createRestEvent({ id: "r2", startTick: 0, durationTicks: 480 }) })).toMatchObject({ ok: false, error: { code: "MEASURE_NOT_FOUND" } });
  });

  it("preserves tied notes and links through rest insertion, resize, movement and deletion", () => {
    const initial = tiedScore();
    let score = apply(initial, insert(initial, 0));
    score = apply(score, update(score, { startTick: 960, durationTicks: 1920 }));
    score = apply(score, { type: "DeleteEvent", partId: score.parts[0].id, eventId: "r1" });
    expect(score).toEqual(initial);
  });

  it("records rest edits in undo/redo and preserves both history branches on failure", () => {
    const initial = tiedScore();
    let session = createEditSession(initial);
    session = applyCommand(session, insert(initial)).session;
    const inserted = session.current;
    session = applyCommand(session, update(inserted, { startTick: 960 })).session;
    const moved = session.current;
    session = undo(session);
    expect(session.current).toEqual(inserted);
    const rejected = applyCommand(session, update(session.current, { startTick: 2880 }));
    expect(rejected.result.ok).toBe(false);
    expect(rejected.session).toBe(session);
    expect(rejected.session.past).toBe(session.past);
    expect(rejected.session.future).toBe(session.future);
    session = redo(session);
    expect(session.current).toEqual(moved);
    session = applyCommand(session, { type: "DeleteEvent", partId: initial.parts[0].id, eventId: "r1" }).session;
    expect(session.current).toEqual(initial);
    expect(undo(session).current).toEqual(moved);
    expect(redo(undo(session)).current).toEqual(initial);
  });

  it("keeps rests valid under the existing ResizeNote reflow", () => {
    let score = withMeasureEvents(baseScore(), [createNoteEvent({ id: "n", step: "C", octave: 4, startTick: 0, durationTicks: 960 })]);
    score = apply(score, insert(score, 960));
    score = apply(score, { type: "ResizeNote", partId: score.parts[0].id, noteId: "n", durationTicks: 3840 });
    expect(score.parts[0].measures[1].events[0]).toMatchObject({ id: "r1", startTick: 3840, durationTicks: 960 });
  });

  it("preserves a following tie when reflow is valid, and rejects reflow that would break its continuity", () => {
    const initial = tiedScore();
    const partId = initial.parts[0].id;
    let score = apply(initial, { type: "AddNote", partId, measureId: initial.parts[0].measures[0].id,
      note: createNoteEvent({ id: "before", step: "D", octave: 4, startTick: 0, durationTicks: 960 }) });
    score = apply(score, insert(score, 960));
    const valid = apply(score, { type: "ResizeNote", partId, noteId: "before", durationTicks: 1920 });
    expect(valid.parts[0].ties).toEqual(initial.parts[0].ties);
    const before = serializeScore(score);
    const result = applyEditCommand(score, { type: "ResizeNote", partId, noteId: "before", durationTicks: 1440 });
    expect(result.ok).toBe(false);
    expect(serializeScore(score)).toBe(before);
  });
});

describe("rest append planning", () => {
  it("uses the common end cursor for mixed notes and rests", () => {
    let score = baseScore();
    const first = planAppendRest(score, { id: "rest", durationTicks: 960 });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.message);
    score = apply(score, first.command);
    const note = planAppendNote(score, { id: "n", durationTicks: 960, pitch: { midi: 60, step: "C", alter: 0, octave: 4 } });
    if (!note.ok) throw new Error(note.message);
    score = apply(score, note.command);
    const next = planAppendRest(score, { id: "rest2", durationTicks: 960 });
    expect(next).toMatchObject({ ok: true, command: { type: "InsertRest", rest: { startTick: 1920 } } });
  });

  it("rejects crossing at execution without silently skipping to the next measure", () => {
    const score = apply(baseScore(), insert(baseScore(), 0, 2880));
    const plan = planAppendRest(score, { id: "r2", durationTicks: 1920 });
    expect(plan).toMatchObject({ ok: true, command: { rest: { startTick: 2880 } } });
    if (plan.ok) expect(applyEditCommand(score, plan.command).ok).toBe(false);
  });

  it("starts the next rest on the next measure when the previous one is full", () => {
    const score = apply(baseScore(), insert(baseScore(), 0, 3840));
    expect(planAppendRest(score, { id: "r2", durationTicks: 960 })).toMatchObject({ ok: true, command: { rest: { startTick: 3840 } } });
  });
});
