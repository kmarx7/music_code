import { describe, expect, it } from "vitest";
import { createEmptyScore, createNoteEvent, serializeScore } from "@/domain/score";
import type { Score } from "@/domain/score";
import { applyCommand, createEditSession, planCut, planDeleteRange, redo, undo } from "@/application";
import { FIXTURE_CREATED_AT, longTiedScore } from "../fixtures/scores";

const BAR = 3840;
function source(): Score {
  const score = createEmptyScore({ id: "delete", measureCount: 3, createdAt: FIXTURE_CREATED_AT });
  score.parts[0].measures[0].events = [createNoteEvent({ id: "a", step: "C", octave: 4, startTick: 0, durationTicks: 960 })];
  score.parts[0].measures[1].events = [createNoteEvent({ id: "b", step: "D", octave: 4, startTick: BAR, durationTicks: 960 }),
    createNoteEvent({ id: "c", step: "E", octave: 4, startTick: BAR + 960, durationTicks: 960 })];
  score.parts[0].measures[2].events = [createNoteEvent({ id: "d", step: "F", octave: 4, startTick: 2 * BAR, durationTicks: 960 })];
  return score;
}

describe("planDeleteRange (MVP-006 선택 구간 삭제)", () => {
  it("builds the same atomic command as Cut, with no clipboard payload", () => {
    const score = source();
    const range = { startTick: BAR, endTick: 2 * BAR };
    const plan = planDeleteRange(score, range);
    const cut = planCut(score, range);
    expect(plan.ok && cut.ok).toBe(true);
    if (!plan.ok || !cut.ok) return;
    expect(plan.command).toEqual(cut.command);
    expect(plan).not.toHaveProperty("clipboard");
  });

  it("removes only the range in one undo step and leaves the gap", () => {
    const score = source();
    const before = serializeScore(score);
    const plan = planDeleteRange(score, { startTick: BAR, endTick: 2 * BAR });
    if (!plan.ok) throw new Error(plan.message);
    const outcome = applyCommand(createEditSession(score), plan.command);
    expect(outcome.result.ok).toBe(true);
    const ids = outcome.session.current.parts[0].measures.flatMap((measure) => measure.events.map((event) => event.id));
    expect(ids).toEqual(["a", "d"]);
    expect(outcome.session.current.parts[0].measures).toHaveLength(3);
    expect(serializeScore(undo(outcome.session).current)).toBe(before);
    expect(redo(undo(outcome.session)).current).toEqual(outcome.session.current);
  });

  it("rejects an empty range and a range that would cut a tie chain, with its own wording", () => {
    expect(planDeleteRange(source(), { startTick: 2 * BAR + 960, endTick: 3 * BAR })).toEqual({ ok: false, message: "삭제할 음표·쉼표가 없습니다." });
    const tied = planDeleteRange(longTiedScore(8), { startTick: 0, endTick: 960 });
    expect(tied.ok).toBe(false);
  });
});
