import { describe, expect, it } from "vitest";
import { validateScore } from "@/domain/score/validate";
import { createNoteEvent } from "@/domain/score/create";
import type { Score, TieLink } from "@/domain/score/types";
import { tiedScore } from "../../tests/fixtures/scores";

function withTies(score: Score, ties: TieLink[]): Score {
  return {
    ...score,
    parts: [{ ...score.parts[0], ties }],
  };
}

function codes(score: Score): string[] {
  return validateScore(score).map((issue) => issue.code);
}

describe("tie validation", () => {
  it("accepts a valid tie chain", () => {
    expect(validateScore(tiedScore())).toEqual([]);
  });

  it("rejects a reference to a non-existent note", () => {
    const score = withTies(tiedScore(), [{ from: "t1", to: "ghost" }]);
    expect(codes(score)).toContain("TIE_UNKNOWN_REF");
  });

  it("rejects a self reference", () => {
    const score = withTies(tiedScore(), [{ from: "t1", to: "t1" }]);
    expect(codes(score)).toContain("TIE_SELF_REF");
  });

  it("rejects a duplicated link", () => {
    const score = withTies(tiedScore(), [
      { from: "t1", to: "t1:tie1" },
      { from: "t1", to: "t1:tie1" },
    ]);
    expect(codes(score)).toContain("TIE_DUPLICATE");
  });

  it("rejects non-contiguous notes", () => {
    const base = tiedScore();
    const score: Score = {
      ...base,
      parts: [
        {
          ...base.parts[0],
          measures: [
            base.parts[0].measures[0],
            {
              ...base.parts[0].measures[1],
              events: [
                createNoteEvent({
                  id: "t1:tie1",
                  step: "C",
                  octave: 4,
                  startTick: 4800,
                  durationTicks: 960,
                }),
              ],
            },
          ],
        },
      ],
    };

    expect(codes(score)).toContain("TIE_NOT_CONTIGUOUS");
  });

  it("rejects notes with different pitches", () => {
    const base = tiedScore();
    const score: Score = {
      ...base,
      parts: [
        {
          ...base.parts[0],
          measures: [
            base.parts[0].measures[0],
            {
              ...base.parts[0].measures[1],
              events: [
                createNoteEvent({
                  id: "t1:tie1",
                  step: "D",
                  octave: 4,
                  startTick: 3840,
                  durationTicks: 960,
                }),
              ],
            },
          ],
        },
      ],
    };

    expect(codes(score)).toContain("TIE_PITCH_MISMATCH");
  });

  it("rejects branching links from a single note", () => {
    const base = tiedScore();
    const extra = createNoteEvent({
      id: "extra",
      step: "C",
      octave: 4,
      startTick: 4800,
      durationTicks: 960,
    });
    const score: Score = {
      ...base,
      parts: [
        {
          ...base.parts[0],
          measures: [
            base.parts[0].measures[0],
            {
              ...base.parts[0].measures[1],
              events: [...base.parts[0].measures[1].events, extra],
            },
          ],
          ties: [
            { from: "t1", to: "t1:tie1" },
            { from: "t1", to: "extra" },
          ],
        },
      ],
    };

    expect(codes(score)).toContain("TIE_BRANCHING");
  });

  it("rejects a cyclic chain", () => {
    const base = tiedScore();
    const score: Score = {
      ...base,
      parts: [
        {
          ...base.parts[0],
          ties: [
            { from: "t1", to: "t1:tie1" },
            { from: "t1:tie1", to: "t1" },
          ],
        },
      ],
    };

    expect(codes(score)).toContain("TIE_CYCLE");
  });

  it("rejects a non-array ties field", () => {
    const base = tiedScore();
    const score = {
      ...base,
      parts: [{ ...base.parts[0], ties: undefined }],
    } as unknown as Score;

    expect(codes(score)).toContain("TIE_INVALID_SHAPE");
  });
});
