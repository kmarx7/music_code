import { describe, expect, it } from "vitest";
import {
  createEmptyScore, createNoteEvent, createRestEvent, selectMeasureRange, selectScoreRange, serializeScore,
} from "@/domain/score";
import type { Score, ScoreEvent, TieLink } from "@/domain/score";
import { FIXTURE_CREATED_AT, longTiedScore, tiedScore } from "../fixtures/scores";

/** 4 measures of 4/4. m1: C4 half + gap; m2: rest + D4 (2880) tied into m3 (3840..4800 → 7680..8640); m4 empty. */
function sample(): Score {
  const score = createEmptyScore({ id: "sel", measureCount: 4, createdAt: FIXTURE_CREATED_AT });
  const part = score.parts[0];
  const events: ScoreEvent[][] = [
    [createNoteEvent({ id: "a", step: "C", octave: 4, startTick: 0, durationTicks: 1920 })],
    [createRestEvent({ id: "r", startTick: 3840, durationTicks: 960 }),
      createNoteEvent({ id: "h", step: "D", octave: 4, startTick: 6720, durationTicks: 960 })],
    [createNoteEvent({ id: "h:tie1", step: "D", octave: 4, startTick: 7680, durationTicks: 960 }),
      createNoteEvent({ id: "b", step: "E", octave: 4, startTick: 9600, durationTicks: 480 })],
    [],
  ];
  const ties: TieLink[] = [{ from: "h", to: "h:tie1" }];
  return { ...score, parts: [{ ...part, ties, measures: part.measures.map((measure, index) => ({ ...measure, events: events[index] })) }] };
}

describe("selectScoreRange", () => {
  it("선택은 [start,end) 안에서 시작하는 이벤트를 시간순으로 담고 gap·쉼표를 포함한다", () => {
    const result = selectScoreRange(sample(), { startTick: 0, endTick: 3840 });
    expect(result).toEqual({ ok: true, selection: { startTick: 0, endTick: 3840, eventIds: ["a"], noteCount: 1, restCount: 0, ties: [] } });
    const rest = selectScoreRange(sample(), { startTick: 3840, endTick: 6720 });
    expect(rest.ok && rest.selection).toMatchObject({ eventIds: ["r"], noteCount: 0, restCount: 1 });
  });

  it("끝 경계에서 시작하는 이벤트는 제외하고 시작 경계의 이벤트는 포함한다", () => {
    const result = selectScoreRange(sample(), { startTick: 1920, endTick: 3840 });
    expect(result.ok && result.selection.eventIds).toEqual([]);
    const next = selectScoreRange(sample(), { startTick: 3840, endTick: 4800 });
    expect(next.ok && next.selection.eventIds).toEqual(["r"]);
  });

  it("이벤트가 없는 빈 구간과 빈 마디도 유효한 선택이다", () => {
    const result = selectScoreRange(sample(), { startTick: 11520, endTick: 15360 });
    expect(result).toEqual({ ok: true, selection: { startTick: 11520, endTick: 15360, eventIds: [], noteCount: 0, restCount: 0, ties: [] } });
  });

  it("타이 체인 전체가 들어오면 체인과 내부 링크를 함께 담는다", () => {
    const result = selectScoreRange(sample(), { startTick: 3840, endTick: 11520 });
    expect(result.ok && result.selection).toEqual({
      startTick: 3840, endTick: 11520, eventIds: ["r", "h", "h:tie1", "b"], noteCount: 3, restCount: 1,
      ties: [{ from: "h", to: "h:tie1" }],
    });
  });

  it("타이 체인을 자르는 선택은 거부하고 체인 전체 범위를 안내한다", () => {
    for (const range of [{ startTick: 3840, endTick: 7680 }, { startTick: 7680, endTick: 11520 }]) {
      const result = selectScoreRange(sample(), range);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.issue).toBe("CUTS_TIE");
      expect(result.eventIds).toEqual(["h", "h:tie1"]);
      expect(result.message).toContain("2–3마디");
    }
  });

  it("이벤트 중간을 자르는 경계는 거부한다", () => {
    for (const range of [{ startTick: 960, endTick: 3840 }, { startTick: 0, endTick: 960 }]) {
      const result = selectScoreRange(sample(), range);
      expect(result).toMatchObject({ ok: false, issue: "CUTS_EVENT", eventIds: ["a"] });
    }
  });

  it("정수가 아니거나 비었거나 악보 밖인 범위를 거부한다", () => {
    const score = sample();
    expect(selectScoreRange(score, { startTick: 0.5, endTick: 3840 })).toMatchObject({ ok: false, issue: "NOT_INTEGER" });
    expect(selectScoreRange(score, { startTick: NaN, endTick: 3840 })).toMatchObject({ ok: false, issue: "NOT_INTEGER" });
    expect(selectScoreRange(score, { startTick: 3840, endTick: 3840 })).toMatchObject({ ok: false, issue: "EMPTY_RANGE" });
    expect(selectScoreRange(score, { startTick: 3840, endTick: 0 })).toMatchObject({ ok: false, issue: "EMPTY_RANGE" });
    expect(selectScoreRange(score, { startTick: -3840, endTick: 3840 })).toMatchObject({ ok: false, issue: "OUT_OF_SCORE" });
    expect(selectScoreRange(score, { startTick: 0, endTick: 15361 })).toMatchObject({ ok: false, issue: "OUT_OF_SCORE" });
    expect(selectScoreRange({ ...score, parts: [] }, { startTick: 0, endTick: 3840 })).toMatchObject({ ok: false, issue: "OUT_OF_SCORE" });
  });

  it("첫 Part만 대상으로 하며 다른 Part의 이벤트는 담지 않는다", () => {
    const score = sample();
    const second = { ...score.parts[0], id: "p2", ties: [], measures: score.parts[0].measures.map((measure, index) => ({
      ...measure, id: `p2-m${index}`, events: index === 0 ? [createNoteEvent({ id: "other", step: "G", octave: 4, startTick: 0, durationTicks: 960 })] : [] })) };
    const result = selectScoreRange({ ...score, parts: [score.parts[0], second] }, { startTick: 0, endTick: 3840 });
    expect(result.ok && result.selection.eventIds).toEqual(["a"]);
  });

  it("선택 계산은 Score를 변경하지 않는다", () => {
    const score = sample();
    const before = serializeScore(score);
    selectScoreRange(score, { startTick: 3840, endTick: 11520 });
    selectScoreRange(score, { startTick: 3840, endTick: 7680 });
    selectScoreRange(score, { startTick: 960, endTick: 3840 });
    expect(serializeScore(score)).toBe(before);
  });

  it("긴 타이 체인(100 세그먼트)도 전체 선택은 허용하고 일부 선택은 거부한다", () => {
    const score = longTiedScore(100);
    const whole = selectScoreRange(score, { startTick: 0, endTick: 100 * 960 });
    expect(whole.ok && whole.selection.eventIds).toHaveLength(100);
    expect(whole.ok && whole.selection.ties).toHaveLength(99);
    expect(selectScoreRange(score, { startTick: 0, endTick: 3840 })).toMatchObject({ ok: false, issue: "CUTS_TIE" });
  });
});

describe("selectMeasureRange", () => {
  it("1부터 세는 마디 번호(끝 포함)를 tick 범위로 바꾼다", () => {
    const result = selectMeasureRange(sample(), 2, 3);
    expect(result.ok && result.selection).toMatchObject({ startTick: 3840, endTick: 11520, eventIds: ["r", "h", "h:tie1", "b"] });
    const one = selectMeasureRange(sample(), 4, 4);
    expect(one.ok && one.selection).toMatchObject({ startTick: 11520, endTick: 15360, eventIds: [] });
  });

  it("3/4 박자에서도 마디 길이를 따른다", () => {
    const score = sample();
    const waltz = { ...score, parts: [{ ...score.parts[0], timeSignature: { numerator: 3, denominator: 4 }, ties: [],
      measures: score.parts[0].measures.map((measure) => ({ ...measure, events: [] })) }] };
    const result = selectMeasureRange(waltz, 2, 2);
    expect(result.ok && result.selection).toMatchObject({ startTick: 2880, endTick: 5760 });
  });

  it("범위 밖·역순·비정수 마디를 거부한다", () => {
    const score = sample();
    for (const [first, last] of [[0, 1], [1, 5], [3, 2], [1.5, 2], [NaN, 2]]) {
      expect(selectMeasureRange(score, first, last)).toMatchObject({ ok: false, issue: "OUT_OF_SCORE" });
    }
  });

  it("마디 경계를 넘는 타이는 한쪽 마디만 선택하면 거부된다", () => {
    expect(selectMeasureRange(tiedScore(), 1, 1)).toMatchObject({ ok: false, issue: "CUTS_TIE", eventIds: ["t1", "t1:tie1"] });
    expect(selectMeasureRange(tiedScore(), 2, 2)).toMatchObject({ ok: false, issue: "CUTS_TIE" });
    const both = selectMeasureRange(tiedScore(), 1, 2);
    expect(both.ok && both.selection.ties).toEqual([{ from: "t1", to: "t1:tie1" }]);
  });
});
