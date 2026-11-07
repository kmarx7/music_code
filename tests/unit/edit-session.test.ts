import { describe, expect, it } from "vitest";
import {
  applyCommand,
  canRedo,
  canUndo,
  createEditSession,
  redo,
  undo,
} from "@/application/edit-session";
import { createNoteEvent } from "@/domain/score/create";
import { countNotes, fourNoteScore } from "../../tests/fixtures/scores";

function addNoteCommand(score: ReturnType<typeof fourNoteScore>) {
  const part = score.parts[0];
  return {
    type: "AddNote" as const,
    partId: part.id,
    measureId: part.measures[1].id,
    note: createNoteEvent({
      id: "n5",
      step: "A",
      octave: 4,
      startTick: 3840,
      durationTicks: 960,
    }),
  };
}

describe("edit session history", () => {
  it("records successful edits and supports undo/redo", () => {
    const initial = fourNoteScore();
    let session = createEditSession(initial);
    expect(canUndo(session)).toBe(false);

    const applied = applyCommand(session, addNoteCommand(initial));
    expect(applied.result.ok).toBe(true);
    session = applied.session;
    expect(countNotes(session.current)).toBe(5);
    expect(session.past).toHaveLength(1);
    expect(canUndo(session)).toBe(true);

    session = undo(session);
    expect(countNotes(session.current)).toBe(4);
    expect(canRedo(session)).toBe(true);

    session = redo(session);
    expect(countNotes(session.current)).toBe(5);
    expect(canRedo(session)).toBe(false);
  });

  it("keeps the session unchanged when a command fails", () => {
    const initial = fourNoteScore();
    const session = createEditSession(initial);

    const outcome = applyCommand(session, {
      type: "UpdateNote",
      partId: initial.parts[0].id,
      noteId: "missing",
      patch: { durationTicks: 480 },
    });

    expect(outcome.result.ok).toBe(false);
    expect(outcome.session).toBe(session);
    expect(session.past).toHaveLength(0);
  });

  it("clears the redo branch after a new edit", () => {
    const initial = fourNoteScore();
    let session = createEditSession(initial);
    session = applyCommand(session, addNoteCommand(initial)).session;
    session = undo(session);
    expect(canRedo(session)).toBe(true);

    session = applyCommand(session, addNoteCommand(session.current)).session;
    expect(canRedo(session)).toBe(false);
  });

  it("does nothing when undo/redo has no history", () => {
    const session = createEditSession(fourNoteScore());
    expect(undo(session)).toBe(session);
    expect(redo(session)).toBe(session);
  });

  it("never mutates previous snapshots", () => {
    const initial = fourNoteScore();
    const initialJson = JSON.stringify(initial);
    let session = createEditSession(initial);
    session = applyCommand(session, addNoteCommand(initial)).session;
    session = undo(session);
    expect(JSON.stringify(initial)).toBe(initialJson);
    expect(JSON.stringify(session.current)).toBe(initialJson);
  });
});
