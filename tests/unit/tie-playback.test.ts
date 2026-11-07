import { describe, expect, it } from "vitest";
import { createEmptyScore, createNoteEvent } from "@/domain/score/create";
import { chainIdsOf, mergeTiedNotes } from "@/domain/score/tie";
import type { Part } from "@/domain/score/types";
import { fourNoteScore, tiedScore } from "../../tests/fixtures/scores";

const CREATED_AT = "2026-11-07T00:00:00.000Z";

function threeSegmentChain(): Part {
  const score = createEmptyScore({
    id: "s",
    measureCount: 3,
    createdAt: CREATED_AT,
  });
  const part = score.parts[0];

  return {
    ...part,
    measures: [
      {
        ...part.measures[0],
        events: [
          createNoteEvent({ id: "c1", step: "G", octave: 4, startTick: 2880, durationTicks: 960 }),
        ],
      },
      {
        ...part.measures[1],
        events: [
          createNoteEvent({ id: "c1:tie1", step: "G", octave: 4, startTick: 3840, durationTicks: 3840 }),
        ],
      },
      {
        ...part.measures[2],
        events: [
          createNoteEvent({ id: "c1:tie2", step: "G", octave: 4, startTick: 7680, durationTicks: 960 }),
        ],
      },
    ],
    ties: [
      { from: "c1", to: "c1:tie1" },
      { from: "c1:tie1", to: "c1:tie2" },
    ],
  };
}

describe("chainIdsOf", () => {
  it("returns the ordered chain for any of its segments", () => {
    const part = tiedScore().parts[0];
    expect(chainIdsOf(part, "t1")).toEqual(["t1", "t1:tie1"]);
    expect(chainIdsOf(part, "t1:tie1")).toEqual(["t1", "t1:tie1"]);
  });

  it("returns an empty list for an unknown id", () => {
    expect(chainIdsOf(tiedScore().parts[0], "ghost")).toEqual([]);
  });

  it("returns a single id for an untied note", () => {
    expect(chainIdsOf(fourNoteScore().parts[0], "n2")).toEqual(["n2"]);
  });
});

describe("mergeTiedNotes", () => {
  it("merges a tied pair into one sustained note (no duplicate attack)", () => {
    const merged = mergeTiedNotes(tiedScore().parts[0]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("t1");
    expect(merged[0].startTick).toBe(2880);
    expect(merged[0].durationTicks).toBe(1920);
    expect(merged[0].pitch.midi).toBe(60);
  });

  it("merges a three-segment chain into one note", () => {
    const merged = mergeTiedNotes(threeSegmentChain());

    expect(merged).toHaveLength(1);
    expect(merged[0].startTick).toBe(2880);
    expect(merged[0].durationTicks).toBe(5760);
  });

  it("keeps untied notes as individual attacks", () => {
    const merged = mergeTiedNotes(fourNoteScore().parts[0]);

    expect(merged).toHaveLength(4);
    expect(merged.map((note) => note.durationTicks)).toEqual([
      960, 960, 960, 960,
    ]);
  });
});
