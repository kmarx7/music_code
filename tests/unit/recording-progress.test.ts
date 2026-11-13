import { describe, expect, it } from "vitest";
import { planRecording } from "@/application";
import { formatRecordingTime, recordingProgress } from "@/features/audio-recording";

const plan = planRecording(120, { numerator: 3, denominator: 4 });

describe("recordingProgress", () => {
  it("waits until the first click is scheduled", () => {
    expect(recordingProgress(0.1, undefined, plan)).toEqual({ phase: "waiting" });
    expect(recordingProgress(0.1, 0.3, plan)).toEqual({ phase: "waiting" });
  });

  it("counts the count-in beats, then measures and beats of the take", () => {
    expect(recordingProgress(0.3, 0.3, plan)).toEqual({ phase: "count-in", beat: 1, beats: 3 });
    expect(recordingProgress(1.29, 0.3, plan)).toEqual({ phase: "count-in", beat: 2, beats: 3 });
    expect(recordingProgress(1.8, 0.3, plan)).toEqual({ phase: "recording", measure: 1, beat: 1, measures: 8, takeSeconds: 0 });
    expect(recordingProgress(3.3 + 0.5, 0.3, plan)).toMatchObject({ phase: "recording", measure: 2, beat: 2 });
  });

  it("stays on the last beat once the take reaches its limit", () => {
    expect(recordingProgress(100, 0.3, plan)).toMatchObject({ phase: "recording", measure: 8, beat: 3 });
  });
});

describe("formatRecordingTime", () => {
  it("formats seconds as m:ss with whole seconds rounded down", () => {
    expect(formatRecordingTime(0)).toBe("0:00");
    expect(formatRecordingTime(9.99)).toBe("0:09");
    expect(formatRecordingTime(96)).toBe("1:36");
    expect(formatRecordingTime(-1)).toBe("0:00");
  });
});
