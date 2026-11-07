import { describe, expect, it } from "vitest";
import { createScoreStore } from "@/store/score-store";
import { createNoteEvent } from "@/domain/score/create";
import { countNotes, fourNoteScore } from "../../tests/fixtures/scores";

function addNote(score: ReturnType<typeof fourNoteScore>) {
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

describe("score store — single canonical owner", () => {
  it("starts empty and initializes a session", () => {
    const store = createScoreStore();
    expect(store.getState()).toBeNull();

    const score = fourNoteScore();
    store.init(score);
    expect(store.getState()?.current).toBe(score);
    expect(store.getState()?.past).toHaveLength(0);
  });

  it("applies a command and records history", () => {
    const store = createScoreStore();
    const score = fourNoteScore();
    store.init(score);

    const result = store.dispatch(addNote(score));
    expect(result?.ok).toBe(true);
    const state = store.getState();
    expect(state).not.toBeNull();
    if (state) {
      expect(countNotes(state.current)).toBe(5);
      expect(state.past).toHaveLength(1);
    }
  });

  it("keeps state unchanged when a command fails", () => {
    const store = createScoreStore();
    const score = fourNoteScore();
    store.init(score);
    const before = store.getState();

    const result = store.dispatch({
      type: "UpdateNote",
      partId: score.parts[0].id,
      noteId: "missing",
      patch: { durationTicks: 480 },
    });

    expect(result?.ok).toBe(false);
    expect(store.getState()).toBe(before);
  });

  it("supports undo and redo", () => {
    const store = createScoreStore();
    const score = fourNoteScore();
    store.init(score);
    store.dispatch(addNote(score));

    store.undo();
    expect(countNotes(store.getState()!.current)).toBe(4);

    store.redo();
    expect(countNotes(store.getState()!.current)).toBe(5);
  });

  it("notifies subscribers on mutation only", () => {
    const store = createScoreStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.init(fourNoteScore());
    expect(notifications).toBe(1);

    const score = fourNoteScore();
    store.init(score);
    store.dispatch({
      type: "UpdateNote",
      partId: score.parts[0].id,
      noteId: "missing",
      patch: { durationTicks: 480 },
    });
    expect(notifications).toBe(2);

    unsubscribe();
    store.undo();
    expect(notifications).toBe(2);
  });
});
