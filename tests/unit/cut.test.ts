import { describe, expect, it } from "vitest";
import {
  createEmptyScore, createNoteEvent, createRestEvent, deserializeScore, mergeTiedNotes, serializeScore, validateScore,
} from "@/domain/score";
import type { Score, ScoreEvent, TieLink } from "@/domain/score";
import { applyEditCommand } from "@/domain/commands";
import { applyCommand, createEditSession, planCut, planPaste, redo, undo } from "@/application";
import { FIXTURE_CREATED_AT, longTiedScore } from "../fixtures/scores";

const BAR = 3840;
/**
 * 6 measures of 4/4. m1: C#4 half + gap; m2: quarter rest, then D4 at beat 4 tied into m3 beat 1;
 * m3: + Eb4 eighth at 9600; m4: G4 whole. m5–m6 empty.
 */
function source(): Score {
  const score = createEmptyScore({ id: "cut", measureCount: 6, createdAt: FIXTURE_CREATED_AT });
  const part = score.parts[0];
  const events: ScoreEvent[][] = [
    [createNoteEvent({ id: "a", step: "C", alter: 1, octave: 4, startTick: 0, durationTicks: 1920, velocity: 70, provenance: { source: "piano" } })],
    [createRestEvent({ id: "r", startTick: BAR, durationTicks: 960 }),
      createNoteEvent({ id: "h", step: "D", octave: 4, startTick: 6720, durationTicks: 960 })],
    [createNoteEvent({ id: "h:tie1", step: "D", octave: 4, startTick: 7680, durationTicks: 960 }),
      createNoteEvent({ id: "b", step: "E", alter: -1, octave: 4, startTick: 9600, durationTicks: 480 })],
    [createNoteEvent({ id: "g", step: "G", octave: 4, startTick: 3 * BAR, durationTicks: BAR })],
  ];
  const ties: TieLink[] = [{ from: "h", to: "h:tie1" }];
  return { ...score, parts: [{ ...part, ties, measures: part.measures.map((measure, index) => ({ ...measure, events: events[index] ?? [] })) }] };
}
const eventsOf = (score: Score) => score.parts[0].measures.flatMap((measure) => measure.events);
function cut(score: Score, startTick: number, endTick: number) {
  const plan = planCut(score, { startTick, endTick });
  if (!plan.ok) throw new Error(plan.message);
  return { plan, result: applyEditCommand(score, plan.command) };
}

describe("planCut + CutEvents", () => {
  it("선택 구간의 이벤트와 내부 타이만 한 번에 지우고 gap을 남기며 다른 이벤트는 움직이지 않는다", () => {
    const score = source();
    const before = serializeScore(score);
    const { plan, result } = cut(score, BAR, 3 * BAR);
    expect(plan.command).toEqual({ type: "CutEvents", partId: score.parts[0].id, startTick: BAR, endTick: 3 * BAR });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.score)).toEqual([eventsOf(score)[0], eventsOf(score)[5]]);
    expect(result.score.parts[0].ties).toEqual([]);
    expect(result.score.parts[0].measures).toHaveLength(6);
    expect(result.score.updatedAt).toBe(score.updatedAt);
    expect(validateScore(result.score)).toEqual([]);
    expect(serializeScore(score)).toBe(before); // input untouched
    const reparsed = deserializeScore(serializeScore(result.score));
    expect(reparsed.ok && reparsed.score).toEqual(result.score);
  });

  it("clipboard payload는 Copy와 같고 잘라낸 뒤 같은 자리에 붙여넣으면 소리가 원래대로 돌아온다", () => {
    const score = source();
    const { plan, result } = cut(score, BAR, 3 * BAR);
    expect(plan.clipboard.lengthTicks).toBe(2 * BAR);
    expect(plan.clipboard.events.map((event) => [event.id, event.kind, event.startTick, event.durationTicks])).toEqual([
      ["r", "rest", 0, 960], ["h", "note", 2880, 960], ["h:tie1", "note", 3840, 960], ["b", "note", 5760, 480],
    ]);
    expect(plan.clipboard.ties).toEqual([{ from: "h", to: "h:tie1" }]);
    if (!result.ok) throw new Error(result.error.message);
    let next = 0;
    const paste = planPaste(result.score, plan.clipboard, { startTick: BAR, createId: () => `n${next++}` });
    if (!paste.ok) throw new Error(paste.message);
    const restored = applyEditCommand(result.score, paste.command);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(mergeTiedNotes(restored.score.parts[0]).map((note) => [note.startTick, note.durationTicks, note.pitch.midi]))
      .toEqual(mergeTiedNotes(score.parts[0]).map((note) => [note.startTick, note.durationTicks, note.pitch.midi]));
    expect(eventsOf(restored.score).filter((event) => event.kind === "rest").map((event) => event.startTick)).toEqual([BAR]);
    // The payload is detached: the cut score no longer contains the source events, the clipboard still does.
    expect(plan.clipboard.events[1]).not.toBe(eventsOf(score)[2]);
  });

  it("범위 밖 타이는 보존하고 dangling tie를 남기지 않는다", () => {
    const score = source();
    const { result } = cut(score, 0, BAR);
    expect(result.ok && result.score.parts[0].ties).toEqual([{ from: "h", to: "h:tie1" }]);
    expect(result.ok && eventsOf(result.score).map((event) => event.id)).toEqual(["r", "h", "h:tie1", "b", "g"]);
    const long = longTiedScore(100);
    const whole = cut(long, 0, 100 * 960).result;
    expect(whole.ok && eventsOf(whole.score)).toEqual([]);
    expect(whole.ok && whole.score.parts[0].ties).toEqual([]);
  });

  it("타이를 자르거나 이벤트 중간을 자르거나 비었거나 악보 밖인 구간은 계획 단계에서 거부한다", () => {
    const score = source();
    for (const [startTick, endTick, text] of [
      [BAR, 2 * BAR, "붙임줄"], [2 * BAR, 3 * BAR, "붙임줄"], [960, BAR, "중간"], [4 * BAR, 6 * BAR, "잘라낼 음표·쉼표가 없습니다"],
      [0, 7 * BAR, "벗어났습니다"], [BAR, BAR, "끝은 시작보다"], [0.5, BAR, "정수"],
    ] as const) {
      const plan = planCut(score, { startTick, endTick });
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.message).toContain(text);
    }
    expect(planCut({ ...score, parts: [] }, { startTick: 0, endTick: BAR }).ok).toBe(false);
  });

  it("Command 자체도 같은 검증을 하며 실패는 Score와 이력을 바꾸지 않는다", () => {
    const score = source();
    const partId = score.parts[0].id;
    const session = createEditSession(score);
    const cases = [
      [{ startTick: BAR, endTick: 2 * BAR }, "INVALID_SELECTION"],
      [{ startTick: 960, endTick: BAR }, "INVALID_SELECTION"],
      [{ startTick: 0, endTick: 7 * BAR }, "INVALID_SELECTION"],
      [{ startTick: BAR, endTick: BAR }, "INVALID_SELECTION"],
      [{ startTick: NaN, endTick: BAR }, "INVALID_SELECTION"],
      [{ startTick: 4 * BAR, endTick: 6 * BAR }, "NOTHING_TO_CUT"],
    ] as const;
    for (const [range, code] of cases) {
      const outcome = applyCommand(session, { type: "CutEvents", partId, ...range });
      expect(outcome.result).toMatchObject({ ok: false, error: { code } });
      expect(outcome.session).toBe(session);
    }
    expect(applyEditCommand(score, { type: "CutEvents", partId: "missing", startTick: 0, endTick: BAR }))
      .toMatchObject({ ok: false, error: { code: "PART_NOT_FOUND" } });
    const second = { ...score.parts[0], id: "p2", ties: [], measures: score.parts[0].measures.map((measure, index) => ({ ...measure, id: `p2-m${index}`, events: [] })) };
    expect(applyEditCommand({ ...score, parts: [score.parts[0], second] }, { type: "CutEvents", partId: "p2", startTick: 0, endTick: BAR }))
      .toMatchObject({ ok: false, error: { code: "PART_NOT_FOUND" } });
  });

  it("성공한 Cut은 Undo 한 번으로 원본 Score 객체로 돌아가고 Redo 한 번으로 같은 결과가 된다", () => {
    const score = source();
    const session = createEditSession(score);
    const plan = planCut(score, { startTick: 0, endTick: 4 * BAR });
    if (!plan.ok) throw new Error(plan.message);
    const done = applyCommand(session, plan.command).session;
    expect(eventsOf(done.current)).toEqual([]);
    expect(done.past).toEqual([score]);
    const undone = undo(done);
    expect(undone.current).toBe(score);
    expect(undone.past).toEqual([]);
    const redone = redo(undone);
    expect(redone.current).toBe(done.current);
  });
});
