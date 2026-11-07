import { describe, expect, it } from "vitest";
import { applyEditCommand, type EditCommand } from "@/domain/commands";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { createRestEvent, measureTicks, validateScore } from "@/domain/score";
import { applyCommand, createEditSession, undo, redo } from "@/application";
import { baseScore, tiedScore, withMeasureEvents } from "../fixtures/scores";

const updatedAt = "2026-11-08T01:00:00.000Z";
const partId = baseScore().parts[0].id;

describe("score settings commands", () => {
  it.each([20, 60, 180, 400])("sets score tempo %s with undo/redo without changing music", (tempoBpm) => {
    const initial = tiedScore();
    const outcome = applyCommand(createEditSession(initial), { type: "SetTempo", tempoBpm, updatedAt });
    expect(outcome.result.ok).toBe(true);
    expect(outcome.session.current.tempoBpm).toBe(tempoBpm);
    expect(outcome.session.current.updatedAt).toBe(updatedAt);
    expect(outcome.session.current.parts).toBe(initial.parts);
    expect(undo(outcome.session).current).toBe(initial);
    expect(redo(undo(outcome.session)).current).toEqual(outcome.session.current);
  });

  it.each(KEY_SIGNATURE_OPTIONS)("changes to $label without altering MIDI, spelling or tie links", ({ key }) => {
    const initial = tiedScore();
    const before = JSON.stringify(initial);
    const outcome = applyCommand(createEditSession(initial), {
      type: "SetKeySignature", partId: initial.parts[0].id, keySignature: key, updatedAt,
    });
    expect(outcome.result.ok).toBe(true);
    const changed = outcome.session.current;
    expect(changed.parts[0].keySignature).toEqual(key);
    expect(changed.parts[0].measures).toBe(initial.parts[0].measures);
    expect(changed.parts[0].ties).toBe(initial.parts[0].ties);
    expect(validateScore(changed)).toEqual([]);
    expect(JSON.stringify(initial)).toBe(before);
    expect(undo(outcome.session).current).toBe(initial);
    expect(redo(undo(outcome.session)).current).toEqual(changed);
  });

  it.each([[2, 4, 1920], [3, 4, 2880], [4, 4, 3840], [6, 8, 2880]])(
    "changes empty score to %s/%s with %s ticks per bar", (numerator, denominator, ticks) => {
      const initial = baseScore();
      const outcome = applyCommand(createEditSession(initial), {
        type: "SetTimeSignature", partId, timeSignature: { numerator, denominator }, updatedAt,
      });
      expect(outcome.result.ok).toBe(true);
      const changed = outcome.session.current;
      expect(measureTicks(changed.parts[0].timeSignature)).toBe(ticks);
      expect(changed.parts[0].measures).toBe(initial.parts[0].measures);
      expect(changed.schemaVersion).toBe(2);
      expect(undo(outcome.session).current).toBe(initial);
      expect(redo(undo(outcome.session)).current).toEqual(changed);
    },
  );

  it.each([baseScore, tiedScore, () => withMeasureEvents(baseScore(), [createRestEvent({ id: "r", startTick: 0, durationTicks: 480 })])])(
    "only permits meter edits on empty scores (%#)", (fixture) => {
      const initial = fixture();
      const before = JSON.stringify(initial);
      const result = applyEditCommand(initial, { type: "SetTimeSignature", partId: initial.parts[0].id,
        timeSignature: { numerator: 3, denominator: 4 }, updatedAt });
      expect(result.ok).toBe(initial.parts[0].measures.every((measure) => measure.events.length === 0));
      if (!result.ok) expect(result.error.code).toBe("TIME_SIGNATURE_REQUIRES_EMPTY_SCORE");
      expect(JSON.stringify(initial)).toBe(before);
    },
  );

  const invalid: EditCommand[] = [
    ...[19, 401, 120.5, NaN, Infinity].map((tempoBpm) => ({ type: "SetTempo" as const, tempoBpm, updatedAt })),
    ...[{ numerator: 0, denominator: 4 }, { numerator: 3, denominator: 3 }, { numerator: 2.5, denominator: 4 }]
      .map((timeSignature) => ({ type: "SetTimeSignature" as const, partId, timeSignature, updatedAt })),
    ...[{ tonic: "C" as const, alter: 0, mode: "major" as const, fifths: 2 },
      { tonic: "C" as const, alter: 4, mode: "major" as const, fifths: 0 },
      { tonic: "C" as const, alter: 0, mode: "major" as const, fifths: 8 }]
      .map((keySignature) => ({ type: "SetKeySignature" as const, partId, keySignature, updatedAt })),
    { type: "SetKeySignature", partId: "missing", keySignature: baseScore().parts[0].keySignature, updatedAt },
    { type: "SetTimeSignature", partId: "missing", timeSignature: { numerator: 3, denominator: 4 }, updatedAt },
  ];

  it.each(invalid)("rejects invalid settings and preserves score, past and redo branch (%#)", (command) => {
    const initial = baseScore();
    let session = applyCommand(createEditSession(initial), { type: "SetTempo", tempoBpm: 80, updatedAt }).session;
    session = undo(session);
    const before = JSON.stringify(session);
    const outcome = applyCommand(session, command);
    expect(outcome.result.ok).toBe(false);
    expect(outcome.session).toBe(session);
    expect(outcome.session.past).toBe(session.past);
    expect(outcome.session.future).toBe(session.future);
    expect(JSON.stringify(session)).toBe(before);
  });
});
