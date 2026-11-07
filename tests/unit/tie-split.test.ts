import { describe, expect, it } from "vitest";
import { createEmptyScore } from "@/domain/score/create";
import { NOTATABLE_DURATIONS, splitNoteIntoMeasures } from "@/domain/score/tie";
import { createPitch } from "@/domain/music-theory/pitch";
import type { Part } from "@/domain/score/types";

const CREATED_AT = "2026-11-07T00:00:00.000Z";
const C4 = createPitch("C", 0, 4);

function partWith(measureCount: number): Part {
  return createEmptyScore({ id: "s", measureCount, createdAt: CREATED_AT }).parts[0];
}

describe("splitNoteIntoMeasures", () => {
  it("splits a 2-beat note that starts on the last beat of 4/4", () => {
    const part = partWith(2);
    const result = splitNoteIntoMeasures(part, {
      id: "n1",
      pitch: C4,
      startTick: 2880,
      durationTicks: 1920,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].measureId).toBe("s:m:0");
    expect(result.segments[0].event.startTick).toBe(2880);
    expect(result.segments[0].event.durationTicks).toBe(960);
    expect(result.segments[1].measureId).toBe("s:m:1");
    expect(result.segments[1].event.startTick).toBe(3840);
    expect(result.segments[1].event.durationTicks).toBe(960);
    expect(result.segments[1].event.id).toBe("n1:tie1");
    expect(result.ties).toEqual([{ from: "n1", to: "n1:tie1" }]);
  });

  it("splits a note that lasts more than two measures", () => {
    const part = partWith(3);
    const result = splitNoteIntoMeasures(part, {
      id: "long",
      pitch: C4,
      startTick: 2880,
      durationTicks: 5760,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.segments).toHaveLength(3);
    expect(result.segments.map((segment) => segment.event.startTick)).toEqual([
      2880, 3840, 7680,
    ]);
    expect(result.segments.map((segment) => segment.event.durationTicks)).toEqual([
      960, 3840, 960,
    ]);
    expect(result.ties).toEqual([
      { from: "long", to: "long:tie1" },
      { from: "long:tie1", to: "long:tie2" },
    ]);
  });

  it("decomposes a length that has no single note value into tied chunks", () => {
    const part = partWith(1);
    const result = splitNoteIntoMeasures(part, {
      id: "n1",
      pitch: C4,
      startTick: 0,
      durationTicks: 3600,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.segments).toHaveLength(2);
    expect(result.segments.map((segment) => segment.event.durationTicks)).toEqual([
      3360, 240,
    ]);
    expect(result.ties).toHaveLength(1);
  });

  it("accepts every notatable duration that fits one measure as a single segment", () => {
    const part = partWith(3);
    const fitting = NOTATABLE_DURATIONS.filter(
      (duration) => duration.ticks <= 3840,
    );
    expect(fitting.length).toBeGreaterThan(0);

    for (const duration of fitting) {
      const result = splitNoteIntoMeasures(part, {
        id: `n-${duration.ticks}`,
        pitch: C4,
        startTick: 0,
        durationTicks: duration.ticks,
      });

      expect(result.ok, `${duration.ticks} ticks`).toBe(true);
      if (result.ok) {
        expect(result.segments).toHaveLength(1);
        expect(result.segments[0].event.durationTicks).toBe(duration.ticks);
      }
    }
  });

  it("splits a duration longer than one measure into tied measures", () => {
    const part = partWith(3);
    const result = splitNoteIntoMeasures(part, {
      id: "whole-dotted",
      pitch: C4,
      startTick: 0,
      durationTicks: 5760,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segments.map((segment) => segment.event.durationTicks)).toEqual([
        3840, 1920,
      ]);
      expect(result.ties).toHaveLength(1);
    }
  });

  it("rejects a duration that cannot be written with note values", () => {
    const part = partWith(2);
    const result = splitNoteIntoMeasures(part, {
      id: "n1",
      pitch: C4,
      startTick: 0,
      durationTicks: 1000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_NOTATABLE");
  });

  it("fails when the note runs past the last measure", () => {
    const part = partWith(1);
    const result = splitNoteIntoMeasures(part, {
      id: "n1",
      pitch: C4,
      startTick: 2880,
      durationTicks: 1920,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OUT_OF_MEASURES");
  });

  it("rejects a non-positive duration", () => {
    const part = partWith(1);
    const result = splitNoteIntoMeasures(part, {
      id: "n1",
      pitch: C4,
      startTick: 0,
      durationTicks: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_DURATION");
  });
});
