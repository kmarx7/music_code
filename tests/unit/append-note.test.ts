import { describe, expect, it } from "vitest";
import { createEmptyScore } from "@/domain/score/create";
import { applyEditCommand } from "@/domain/commands/apply";
import { createPitch } from "@/domain/music-theory/pitch";
import { planAppendNote } from "@/application/append-note";
import type { Score } from "@/domain/score/types";

const CREATED_AT = "2026-11-07T00:00:00.000Z";
const C4 = createPitch("C", 0, 4);

function emptyScore(measureCount: number): Score {
  return createEmptyScore({
    id: "score-1",
    measureCount,
    createdAt: CREATED_AT,
  });
}

describe("planAppendNote", () => {
  it("appends the first note at tick 0 of measure 0", () => {
    const plan = planAppendNote(emptyScore(8), {
      pitch: C4,
      durationTicks: 960,
      id: "n1",
    });

    expect(plan.ok).toBe(true);
    if (plan.ok && plan.command.type === "AddNote") {
      expect(plan.command.note.startTick).toBe(0);
      expect(plan.command.measureId).toBe("score-1:m:0");
      expect(plan.command.note.provenance?.source).toBe("piano");
    }
  });

  it("appends sequentially after existing events", () => {
    let score = emptyScore(8);
    const first = planAppendNote(score, { pitch: C4, durationTicks: 960, id: "n1" });
    if (!first.ok) throw new Error("first plan failed");
    const applied = applyEditCommand(score, first.command);
    if (!applied.ok) throw new Error("apply failed");
    score = applied.score;

    const second = planAppendNote(score, { pitch: C4, durationTicks: 960, id: "n2" });
    expect(second.ok).toBe(true);
    if (second.ok && second.command.type === "AddNote") {
      expect(second.command.note.startTick).toBe(960);
    }
  });

  it("moves to the next measure when the current one is full", () => {
    let score = emptyScore(8);
    for (let index = 0; index < 4; index += 1) {
      const plan = planAppendNote(score, {
        pitch: C4,
        durationTicks: 960,
        id: `n${index}`,
      });
      if (!plan.ok) throw new Error("plan failed");
      const applied = applyEditCommand(score, plan.command);
      if (!applied.ok) throw new Error("apply failed");
      score = applied.score;
    }

    const fifth = planAppendNote(score, {
      pitch: C4,
      durationTicks: 960,
      id: "n4",
    });
    expect(fifth.ok).toBe(true);
    if (fifth.ok && fifth.command.type === "AddNote") {
      expect(fifth.command.measureId).toBe("score-1:m:1");
      expect(fifth.command.note.startTick).toBe(3840);
    }
  });

  it("reports a full score instead of overflowing a measure", () => {
    let score = emptyScore(1);
    for (let index = 0; index < 4; index += 1) {
      const plan = planAppendNote(score, {
        pitch: C4,
        durationTicks: 960,
        id: `n${index}`,
      });
      if (!plan.ok) throw new Error("plan failed");
      const applied = applyEditCommand(score, plan.command);
      if (!applied.ok) throw new Error("apply failed");
      score = applied.score;
    }

    const overflow = planAppendNote(score, {
      pitch: C4,
      durationTicks: 960,
      id: "overflow",
    });
    expect(overflow.ok).toBe(false);
  });

  it("rejects invalid duration", () => {
    const plan = planAppendNote(emptyScore(1), {
      pitch: C4,
      durationTicks: 0,
      id: "bad",
    });
    expect(plan.ok).toBe(false);
  });
});
