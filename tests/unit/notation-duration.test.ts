import { expect, it } from "vitest";
import { decomposeNotationDuration, planPartNotation, MAX_NOTATION_FRAGMENTS, MAX_NOTATION_TICKABLES } from "@/domain/score";
import { createEmptyScore, createNoteEvent, createRestEvent, NOTATABLE_DURATIONS, serializeScore } from "@/domain/score";
import { longTiedScore, baseScore, withMeasureEvents } from "../fixtures/scores";

it.each(NOTATABLE_DURATIONS)("keeps exact $ticks ticks as one supported glyph including its dots", (duration) => {
  expect(decomposeNotationDuration(duration.ticks)).toEqual({ ok: true, durations: [duration] });
});
it.each([[300, [180, 120]], [510, [210, 180, 120]], [600, [480, 120]]])("finds an exact deterministic minimum-count plan for %s", (ticks, expected) => {
  const result = decomposeNotationDuration(ticks as number); if (!result.ok) throw new Error(result.issue.message);
  expect(result.durations.map((duration) => duration.ticks)).toEqual(expected);
  expect(result.durations.reduce((sum, duration) => sum + duration.ticks, 0)).toBe(ticks);
  expect(decomposeNotationDuration(ticks as number)).toEqual(result);
});
it.each([1, 119, 150, 1000])("rejects unrepresentable %s ticks instead of approximating", (ticks) => {
  expect(decomposeNotationDuration(ticks)).toMatchObject({ ok: false, issue: { code: "NOT_NOTATABLE" } });
});
it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid duration %s before allocation", (ticks) => {
  expect(decomposeNotationDuration(ticks)).toMatchObject({ ok: false, issue: { code: "INVALID_NOTATION_DURATION" } });
});
it("bounds glyph count and search space while accepting the precise 64-glyph limit", () => {
  const max = MAX_NOTATION_FRAGMENTS * NOTATABLE_DURATIONS[0].ticks;
  const result = decomposeNotationDuration(max); if (!result.ok) throw new Error(result.issue.message);
  expect(result.durations).toHaveLength(64); expect(result.durations.reduce((n, d) => n + d.ticks, 0)).toBe(max);
  expect(decomposeNotationDuration(max + 30)).toMatchObject({ ok: false, issue: { code: "NOTATION_LIMIT" } });
  expect(decomposeNotationDuration(Number.MAX_SAFE_INTEGER)).toMatchObject({ ok: false, issue: { code: "NOTATION_LIMIT" } });
});
it("projects notes and rests at exact absolute positions without changing canonical IDs, ties or JSON", () => {
  const score = withMeasureEvents(baseScore(), [createNoteEvent({ id: "n", step: "C", octave: 4, startTick: 120, durationTicks: 300 }), createRestEvent({ id: "r", startTick: 600, durationTicks: 300 })]);
  const before = serializeScore(score); const result = planPartNotation(score.parts[0]); if (!result.ok) throw new Error(result.issue.message);
  expect(result.measures[0].map((f) => [f.event.id, f.startTick, f.duration.ticks])).toEqual([["n", 120, 180], ["n", 300, 120], ["r", 600, 180], ["r", 780, 120]]);
  expect(result.measures[0][0].event).toBe(score.parts[0].measures[0].events[0]); expect(serializeScore(score)).toBe(before);
});
it("reports the original event and measure without rejecting or changing its stored Score", () => {
  const score = withMeasureEvents(baseScore(), [createNoteEvent({ id: "bad", step: "C", octave: 4, startTick: 960, durationTicks: 1000 })]); const before = serializeScore(score);
  expect(planPartNotation(score.parts[0])).toMatchObject({ ok: false, issue: { code: "NOT_NOTATABLE", eventId: "bad", measureNumber: 1, startTick: 960, durationTicks: 1000 } });
  expect(serializeScore(score)).toBe(before);
});
it.each([[-1, 300], [3600, 300], [0.5, 300]])("rejects invalid or crossing positions %s + %s", (startTick, durationTicks) => {
  const score = withMeasureEvents(baseScore(), [createRestEvent({ id: "r", startTick, durationTicks })]);
  expect(planPartNotation(score.parts[0])).toMatchObject({ ok: false, issue: { code: "INVALID_NOTATION_POSITION" } });
});
it("keeps H-01 long chains and their canonical ties untouched", () => {
  const score = longTiedScore(128); const before = serializeScore(score); const result = planPartNotation(score.parts[0]);
  expect(result.ok).toBe(true); if (result.ok) expect(result.measures.flat()).toHaveLength(128);
  expect(serializeScore(score)).toBe(before);
});
it("caps the aggregate Part including gaps, without imposing a Score read limit", () => {
  const score = createEmptyScore({ id: "dense", measureCount: 129, createdAt: "fixed" });
  for (const measure of score.parts[0].measures) measure.events = Array.from({ length: 32 }, (_, n) => createRestEvent({ id: `${measure.id}:${n}`, startTick: measure.index * 3840 + n * 120, durationTicks: 120 }));
  expect(MAX_NOTATION_TICKABLES).toBe(4096);
  expect(planPartNotation(score.parts[0])).toMatchObject({ ok: false, issue: { code: "NOTATION_LIMIT" } });
});
