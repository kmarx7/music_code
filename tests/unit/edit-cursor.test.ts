import { expect, it } from "vitest";
import { planAppendNote, planNoteAt, noteInputTick } from "@/application";
import { createScoreStore } from "@/store/score-store";
import { createPitch } from "@/domain/music-theory";
import { createRestEvent, mergeTiedNotes, validateScore } from "@/domain/score";
import { baseScore, tiedScore } from "../fixtures/scores";

const pitch = createPitch("D", 0, 4);
function input(startTick: number, durationTicks = 960, id = "inserted") { return { startTick, durationTicks, id, pitch }; }

it.each([0, 480, 3840, 4800, 6720])("inserts into an empty position at absolute tick %s without moving existing notes", (tick) => {
  const store = createScoreStore(); const initial = baseScore(); store.init(initial);
  const plan = planNoteAt(initial, input(tick));
  expect(plan.ok).toBe(true); if (!plan.ok) return;
  expect(store.dispatch(plan.command)?.ok).toBe(true);
  const result = store.getState()!.current;
  expect(result.parts[0].measures.flatMap((m) => m.events)[0]).toMatchObject({ startTick: tick, durationTicks: 960, pitch });
  expect(initial.parts[0].measures.flatMap((m) => m.events)).toEqual([]);
  expect(validateScore(result)).toEqual([]);
});
it.each([-1, 0.5, NaN, Infinity, 7680, 9000])("rejects an invalid/outside start tick %s before dispatch", (startTick) => {
  const store = createScoreStore(); store.init(baseScore()); const before = store.getState()!;
  expect(planNoteAt(before.current, input(startTick)).ok).toBe(false);
  expect(store.getState()).toBe(before);
});
it.each([0, -1, 0.5, 1, 100, 1920])("rejects invalid duration or score-end overflow (%s) without changing score/history", (duration) => {
  const store = createScoreStore(); store.init(baseScore());
  const before = store.getState()!; const bytes = JSON.stringify(before);
  const plan = planNoteAt(before.current, input(6720, duration));
  if (plan.ok) expect(store.dispatch(plan.command)?.ok).toBe(false);
  expect(store.getState()).toBe(before); expect(JSON.stringify(before)).toBe(bytes);
});
it.each(["note", "rest"])("rejects collision with %s and preserves redo branch and existing ties", (kind) => {
  const store = createScoreStore(); store.init(tiedScore());
  if (kind === "rest") expect(store.dispatch({ type: "InsertRest", partId: "score-tie:part:1", measureId: "score-tie:m:0",
    rest: createRestEvent({ id: "rest", startTick: 960, durationTicks: 960 }) })?.ok).toBe(true);
  const spare = planNoteAt(store.getState()!.current, input(5760));
  if (!spare.ok) throw new Error(spare.message);
  store.dispatch(spare.command); store.undo();
  const before = store.getState()!; const bytes = JSON.stringify(before);
  const plan = planNoteAt(before.current, input(kind === "rest" ? 960 : 2880, 1920, "collision"));
  if (!plan.ok) throw new Error(plan.message);
  expect(store.dispatch(plan.command)?.ok).toBe(false);
  expect(store.getState()).toBe(before); expect(JSON.stringify(before)).toBe(bytes);
  store.redo(); expect(store.getState()!.current.parts[0].measures[1].events.some((e) => e.id === "inserted")).toBe(true);
});
it("splits a bar-crossing insertion with existing AddNote and preserves an unrelated tie chain", () => {
  const store = createScoreStore(); const initial = tiedScore(); store.init(initial);
  const plan = planNoteAt(initial, input(960, 1920));
  if (!plan.ok) throw new Error(plan.message);
  expect(store.dispatch(plan.command)?.ok).toBe(true);
  const edited = store.getState()!.current;
  expect(edited.parts[0].ties).toEqual(initial.parts[0].ties);
  expect(edited.parts[0].measures[0].events.find((e) => e.id === "t1")).toEqual(initial.parts[0].measures[0].events[0]);
  store.undo(); expect(store.getState()!.current).toBe(initial);
  store.redo(); expect(store.getState()!.current).toBe(edited);
  const crossingStore = createScoreStore(); crossingStore.init(baseScore());
  const crossing = planNoteAt(crossingStore.getState()!.current, input(2880, 1920));
  if (!crossing.ok) throw new Error(crossing.message);
  expect(crossingStore.dispatch(crossing.command)?.ok).toBe(true);
  const part = crossingStore.getState()!.current.parts[0];
  expect(part.ties).toEqual([{ from: "inserted", to: "inserted:tie1" }]);
  expect(mergeTiedNotes(part)).toMatchObject([{ startTick: 2880, durationTicks: 1920, pitch }]);
});
it("append mode remains after the last event rather than filling an earlier gap", () => {
  const store = createScoreStore(); store.init(baseScore());
  const first = planNoteAt(store.getState()!.current, input(3840)); if (!first.ok) throw new Error(first.message);
  store.dispatch(first.command);
  const append = planAppendNote(store.getState()!.current, { pitch, durationTicks: 960, id: "append" });
  expect(append.ok && append.command.type === "AddNote" && append.command.note.startTick).toBe(4800);
});
it("rejects a collision in the later tied segment without inserting the free first segment", () => {
  const store = createScoreStore(); store.init(baseScore());
  expect(store.dispatch({ type: "InsertRest", partId: "score-1:part:1", measureId: "score-1:m:1",
    rest: createRestEvent({ id: "occupied", startTick: 3840, durationTicks: 960 }) })?.ok).toBe(true);
  const before = store.getState()!;
  const plan = planNoteAt(before.current, input(2880, 1920));
  if (!plan.ok) throw new Error(plan.message);
  expect(store.dispatch(plan.command)?.ok).toBe(false);
  expect(store.getState()).toBe(before);
  expect(store.getState()!.current.parts[0].measures[0].events).toEqual([]);
  expect(store.getState()!.current.parts[0].ties).toEqual([]);
});
it.each([
  [2, 4, 2, 2, 2880], [3, 4, 2, 3, 4800], [4, 4, 2, 1.5, 4320], [6, 8, 2, 6, 5280],
])("maps %s/%s measure %s beat %s to absolute tick %s", (numerator, denominator, measure, beat, tick) => {
  const part = baseScore().parts[0]; part.timeSignature = { numerator, denominator };
  expect(noteInputTick(part, measure, beat)).toBe(tick);
});
it.each([[0, 1], [3, 1], [1.5, 1], [1, 0], [1, 5], [1, NaN], [1, 1.0001]])("rejects invalid measure/beat (%s, %s)", (measure, beat) => {
  expect(noteInputTick(baseScore().parts[0], measure, beat)).toBeNull();
});
