import { describe, expect, it } from "vitest";
import { validateScore } from "@/domain/score/validate";
import { measureStartTick, measureTicks } from "@/domain/score/create";
import {
  fourNoteScore,
  scoreWithBadPitch,
  scoreWithCrossingEvent,
  scoreWithDuplicateEventId,
  scoreWithOverlap,
  scoreWithSpellingMismatch,
  scoreWithZeroDuration,
} from "../../tests/fixtures/scores";

function codes(score: Parameters<typeof validateScore>[0]): string[] {
  return validateScore(score).map((issue) => issue.code);
}

describe("validateScore — music time", () => {
  it("computes 4/4 measure ticks and starts", () => {
    const timeSignature = { numerator: 4, denominator: 4 };
    expect(measureTicks(timeSignature)).toBe(3840);
    expect(measureStartTick(0, timeSignature)).toBe(0);
    expect(measureStartTick(1, timeSignature)).toBe(3840);
    expect(measureTicks({ numerator: 6, denominator: 8 })).toBe(2880);
  });
});

describe("validateScore — valid score", () => {
  it("accepts the four-note fixture", () => {
    expect(validateScore(fourNoteScore())).toEqual([]);
  });
});

describe("validateScore — invariants", () => {
  it("rejects duplicate event ids", () => {
    expect(codes(scoreWithDuplicateEventId())).toContain("DUPLICATE_ID");
  });

  it("rejects overlapping events in a monophonic voice", () => {
    expect(codes(scoreWithOverlap())).toContain("OVERLAPPING_EVENTS");
  });

  it("rejects non-positive durations", () => {
    expect(codes(scoreWithZeroDuration())).toContain("INVALID_DURATION");
  });

  it("rejects events that cross a measure boundary", () => {
    expect(codes(scoreWithCrossingEvent())).toContain("EVENT_OUT_OF_MEASURE");
  });

  it("rejects out-of-range MIDI pitches", () => {
    expect(codes(scoreWithBadPitch())).toContain("INVALID_PITCH");
  });

  it("rejects MIDI that disagrees with the written spelling", () => {
    expect(codes(scoreWithSpellingMismatch())).toContain("PITCH_SPELLING_MISMATCH");
  });
});
