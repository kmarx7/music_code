import { describe, expect, it } from "vitest";
import {
  copyScoreRange, createEmptyScore, createNoteEvent, createRestEvent, deserializeScore, mergeTiedNotes,
  serializeScore, validateScore,
} from "@/domain/score";
import type { ClipboardPayload, Score, ScoreEvent, TieLink } from "@/domain/score";
import { applyEditCommand } from "@/domain/commands";
import { applyCommand, createEditSession, planPaste, redo, undo } from "@/application";
import { FIXTURE_CREATED_AT } from "../fixtures/scores";

const BAR = 3840;
/**
 * 8 measures of 4/4. m1: C#4 half (velocity 70, piano) + gap; m2: quarter rest, then D4 at beat 4 tied into
 * m3 beat 1; m3: + Eb4 eighth at 9600. m4–m8 empty.
 */
function source(measureCount = 8): Score {
  const score = createEmptyScore({ id: "clip", measureCount, createdAt: FIXTURE_CREATED_AT });
  const part = score.parts[0];
  const events: ScoreEvent[][] = [
    [createNoteEvent({ id: "a", step: "C", alter: 1, octave: 4, startTick: 0, durationTicks: 1920, velocity: 70, provenance: { source: "piano" } })],
    [createRestEvent({ id: "r", startTick: BAR, durationTicks: 960 }),
      createNoteEvent({ id: "h", step: "D", octave: 4, startTick: 6720, durationTicks: 960 })],
    [createNoteEvent({ id: "h:tie1", step: "D", octave: 4, startTick: 7680, durationTicks: 960 }),
      createNoteEvent({ id: "b", step: "E", alter: -1, octave: 4, startTick: 9600, durationTicks: 480, provenance: { source: "transcription", confidence: 0.5 } })],
  ];
  const ties: TieLink[] = [{ from: "h", to: "h:tie1" }];
  return { ...score, parts: [{ ...part, ties, measures: part.measures.map((measure, index) => ({ ...measure, events: events[index] ?? [] })) }] };
}
function copied(score: Score, startTick: number, endTick: number): ClipboardPayload {
  const result = copyScoreRange(score, { startTick, endTick });
  if (!result.ok) throw new Error(result.message);
  return result.clipboard;
}
function ids(prefix = "new"): () => string { let next = 0; return () => `${prefix}-${next++}`; }
function paste(score: Score, clipboard: ClipboardPayload, startTick: number, createId = ids()) {
  const plan = planPaste(score, clipboard, { startTick, createId });
  if (!plan.ok) throw new Error(plan.message);
  return applyEditCommand(score, plan.command);
}
const eventsOf = (score: Score) => score.parts[0].measures.flatMap((measure) => measure.events);
const allIds = (score: Score) => eventsOf(score).map((event) => event.id);

describe("copyScoreRange", () => {
  it("상대 tick·쉼표·gap·타이와 Pitch 철자/velocity/provenance를 읽기 전용 payload로 만든다", () => {
    const score = source();
    const clipboard = copied(score, BAR, 3 * BAR);
    expect(clipboard.lengthTicks).toBe(2 * BAR);
    expect(clipboard.events.map((event) => [event.id, event.kind, event.startTick, event.durationTicks])).toEqual([
      ["r", "rest", 0, 960], ["h", "note", 2880, 960], ["h:tie1", "note", 3840, 960], ["b", "note", 5760, 480],
    ]);
    expect(clipboard.ties).toEqual([{ from: "h", to: "h:tie1" }]);
    const first = copied(score, 0, BAR);
    expect(first.events).toEqual([{ ...eventsOf(score)[0] }]);
    expect(first.events[0]).toMatchObject({ pitch: { step: "C", alter: 1, octave: 4, midi: 61 }, velocity: 70, provenance: { source: "piano" } });
    expect(first.lengthTicks).toBe(BAR); // trailing gap is part of the payload
  });

  it("payload는 Score와 객체를 공유하지 않고 복사는 Score를 바꾸지 않는다", () => {
    const score = source();
    const before = serializeScore(score);
    const clipboard = copied(score, 0, BAR);
    const original = eventsOf(score)[0];
    expect(clipboard.events[0]).not.toBe(original);
    if (clipboard.events[0].kind === "note" && original.kind === "note") {
      expect(clipboard.events[0].pitch).not.toBe(original.pitch);
      expect(clipboard.events[0].provenance).not.toBe(original.provenance);
    }
    expect(serializeScore(score)).toBe(before);
  });

  it("타이를 자르는 범위·잘못된 범위·이벤트 없는 범위는 복사하지 않는다", () => {
    const score = source();
    expect(copyScoreRange(score, { startTick: BAR, endTick: 2 * BAR })).toMatchObject({ ok: false, issue: "CUTS_TIE" });
    expect(copyScoreRange(score, { startTick: 960, endTick: BAR })).toMatchObject({ ok: false, issue: "CUTS_EVENT" });
    expect(copyScoreRange(score, { startTick: 0, endTick: 99 * BAR })).toMatchObject({ ok: false, issue: "OUT_OF_SCORE" });
    expect(copyScoreRange(score, { startTick: 3 * BAR, endTick: 4 * BAR })).toMatchObject({ ok: false, issue: "EMPTY_SELECTION" });
  });
});

describe("PasteEvents", () => {
  it("빈 대상에 같은 상대 위치로 붙여넣고 fresh ID와 타이 참조를 매핑한다", () => {
    const score = source();
    const result = paste(score, copied(score, BAR, 3 * BAR), 4 * BAR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateScore(result.score)).toEqual([]);
    const pasted = eventsOf(result.score).filter((event) => event.startTick >= 4 * BAR);
    expect(pasted.map((event) => [event.id, event.kind, event.startTick, event.durationTicks])).toEqual([
      ["new-0", "rest", 4 * BAR, 960], ["new-1", "note", 4 * BAR + 2880, 960],
      ["new-2", "note", 5 * BAR, 960], ["new-3", "note", 5 * BAR + 1920, 480],
    ]);
    expect(result.score.parts[0].ties).toEqual([{ from: "h", to: "h:tie1" }, { from: "new-1", to: "new-2" }]);
    expect(pasted[3]).toMatchObject({ pitch: { step: "E", alter: -1, octave: 4, midi: 63 }, velocity: 96, provenance: { source: "transcription", confidence: 0.5 } });
    // The source events and the original Score object are untouched.
    expect(eventsOf(result.score).slice(0, 5)).toEqual(eventsOf(score));
    expect(serializeScore(score)).toBe(serializeScore(source()));
  });

  it("여러 번 붙여넣어도 모든 이벤트 ID가 유일하다", () => {
    const score = source();
    const clipboard = copied(score, 0, BAR);
    const createId = ids();
    let current = score;
    for (const measure of [3, 4, 5, 6, 7]) {
      const result = paste(current, clipboard, measure * BAR, createId);
      expect(result.ok).toBe(true);
      if (result.ok) current = result.score;
    }
    expect(new Set(allIds(current)).size).toBe(allIds(current).length);
    expect(allIds(current)).toHaveLength(10);
    expect(validateScore(current)).toEqual([]);
  });

  it("대상 범위(gap 포함)에 기존 이벤트가 있으면 부분 적용 없이 거부한다", () => {
    const score = source();
    for (const [clipboard, at] of [
      [copied(score, 0, BAR), BAR], // rest at the target start
      [copied(score, 0, BAR), 2 * BAR], // only the payload's trailing gap would collide with `b`
      [copied(score, BAR, 3 * BAR), 2 * BAR],
      [copied(score, 0, BAR), 0], // onto itself
    ] as const) {
      const session = createEditSession(score);
      const plan = planPaste(score, clipboard, { startTick: at, createId: ids() });
      expect(plan.ok).toBe(true);
      if (!plan.ok) continue;
      const outcome = applyCommand(session, plan.command);
      expect(outcome.result).toMatchObject({ ok: false, error: { code: "PASTE_TARGET_OCCUPIED" } });
      expect(outcome.session).toBe(session);
    }
    expect(serializeScore(score)).toBe(serializeScore(source()));
  });

  it("마디가 부족하면 자동으로 마디를 늘리지 않고 거부한다", () => {
    const score = source();
    const result = paste(score, copied(score, BAR, 3 * BAR), 7 * BAR);
    expect(result).toMatchObject({ ok: false, error: { code: "MEASURE_CAPACITY_EXCEEDED" } });
    expect(paste(score, copied(score, 0, BAR), 8 * BAR)).toMatchObject({ ok: false, error: { code: "MEASURE_CAPACITY_EXCEEDED" } });
    expect(paste(score, copied(score, 0, BAR), -BAR)).toMatchObject({ ok: false });
    expect(paste(score, copied(score, 0, BAR), 3 * BAR + 0.5)).toMatchObject({ ok: false });
  });

  it("박 위치가 달라 마디 경계를 넘는 음표는 기존 분할로 나누고 타이 체인을 잇는다", () => {
    const score = source();
    // `a` (half) pasted at m5 beat 4: 960 in m5 + 960 in m6.
    const result = paste(score, copied(score, 0, 1920), 4 * BAR + 2880);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateScore(result.score)).toEqual([]);
    const pasted = eventsOf(result.score).filter((event) => event.startTick >= 4 * BAR);
    expect(pasted.map((event) => [event.id, event.startTick, event.durationTicks])).toEqual([
      ["new-0", 4 * BAR + 2880, 960], ["new-0:tie1", 5 * BAR, 960],
    ]);
    expect(result.score.parts[0].ties).toContainEqual({ from: "new-0", to: "new-0:tie1" });
    expect(pasted.every((event) => event.kind === "note" && event.pitch.midi === 61 && event.velocity === 70)).toBe(true);
  });

  it("분할된 음표가 기존 체인의 일부이면 체인의 끝과 시작을 올바르게 연결한다", () => {
    const score = source();
    // Chain h(960)+h:tie1(960) starting at relative 2880; shift by +480 so h itself crosses the barline.
    const result = paste(score, copied(score, BAR, 3 * BAR), 4 * BAR + 480);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateScore(result.score)).toEqual([]);
    const merged = mergeTiedNotes(result.score.parts[0]).filter((note) => note.startTick >= 4 * BAR);
    expect(merged.map((note) => [note.pitch.midi, note.startTick, note.durationTicks])).toEqual([
      [62, 4 * BAR + 480 + 2880, 1920], [63, 4 * BAR + 480 + 5760, 480],
    ]);
  });

  it("마디 경계를 넘게 되는 쉼표는 거부한다", () => {
    const score = source();
    const result = paste(score, copied(score, BAR, 3 * BAR), 4 * BAR + 3360);
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_NOTATABLE" } });
  });

  it("빈 payload·중복 ID·없는 Part를 거부한다", () => {
    const score = source();
    const clipboard = copied(score, 0, BAR);
    expect(applyEditCommand(score, { type: "PasteEvents", partId: score.parts[0].id, startTick: 4 * BAR,
      clipboard: { lengthTicks: BAR, events: [], ties: [] } })).toMatchObject({ ok: false, error: { code: "NOTHING_TO_PASTE" } });
    expect(applyEditCommand(score, { type: "PasteEvents", partId: score.parts[0].id, startTick: 4 * BAR, clipboard }))
      .toMatchObject({ ok: false, error: { code: "DUPLICATE_ID" } }); // original IDs were not refreshed
    expect(applyEditCommand(score, { type: "PasteEvents", partId: "nope", startTick: 4 * BAR, clipboard }))
      .toMatchObject({ ok: false, error: { code: "PART_NOT_FOUND" } });
    expect(planPaste({ ...score, parts: [] }, clipboard, { startTick: 0, createId: ids() })).toMatchObject({ ok: false });
    const twin = planPaste(score, clipboard, { startTick: 4 * BAR, createId: () => "same" });
    expect(twin.ok && applyEditCommand(score, twin.command).ok).toBe(true); // one event: a single ID is fine
    const collide = planPaste(score, copied(score, BAR, 3 * BAR), { startTick: 4 * BAR, createId: () => "same" });
    expect(collide.ok && applyEditCommand(score, collide.command)).toMatchObject({ ok: false, error: { code: "DUPLICATE_ID" } });
  });

  it("붙여넣기는 Undo 한 번·Redo 한 번의 단일 이력 단위다", () => {
    const score = source();
    const session = createEditSession(score);
    const plan = planPaste(score, copied(score, BAR, 3 * BAR), { startTick: 4 * BAR, createId: ids() });
    if (!plan.ok) throw new Error(plan.message);
    const done = applyCommand(session, plan.command).session;
    expect(done.past).toEqual([score]);
    expect(eventsOf(done.current)).toHaveLength(9);
    const undone = undo(done);
    expect(undone.current).toBe(score);
    expect(undone.past).toEqual([]);
    const redone = redo(undone);
    expect(redone.current).toBe(done.current);
    expect(redone.future).toEqual([]);
  });

  it("붙여넣은 Score는 JSON 왕복 후에도 동일하고 updatedAt을 바꾸지 않는다", () => {
    const score = source();
    const result = paste(score, copied(score, BAR, 3 * BAR), 4 * BAR);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.score.updatedAt).toBe(score.updatedAt);
    const round = deserializeScore(serializeScore(result.score));
    expect(round.ok && serializeScore(round.score)).toBe(serializeScore(result.score));
  });

  it("모든 8분음표 offset에서 성공한 붙여넣기는 유효하고 소리(병합 음)가 원본과 같다", () => {
    const score = source(12);
    const clipboard = copied(score, 0, 3 * BAR);
    const expected = mergeTiedNotes(score.parts[0]).map((note) => [note.pitch.midi, note.startTick, note.durationTicks, note.velocity]);
    let succeeded = 0;
    for (let offset = 0; offset < BAR; offset += 480) {
      const at = 4 * BAR + offset;
      const result = paste(score, clipboard, at);
      if (!result.ok) { expect(result.error.code).toBe("NOT_NOTATABLE"); continue; }
      succeeded += 1;
      expect(validateScore(result.score)).toEqual([]);
      const pasted = mergeTiedNotes(result.score.parts[0]).filter((note) => note.startTick >= at)
        .map((note) => [note.pitch.midi, note.startTick - at, note.durationTicks, note.velocity]);
      expect(pasted).toEqual(expected);
      expect(new Set(allIds(result.score)).size).toBe(allIds(result.score).length);
    }
    expect(succeeded).toBeGreaterThanOrEqual(4);
  });
});
