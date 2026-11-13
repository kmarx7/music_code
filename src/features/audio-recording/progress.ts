import type { RecordingPlan } from "@/application";

export type RecordingProgress =
  | { phase: "waiting" }
  | { phase: "count-in"; beat: number; beats: number }
  | { phase: "recording"; measure: number; beat: number; measures: number; takeSeconds: number };

/** Where a take is, from the seconds captured and the recording time of the first click. Beats and measures are 1-based. */
export function recordingProgress(seconds: number, metronomeStartSeconds: number | undefined, plan: RecordingPlan): RecordingProgress {
  if (metronomeStartSeconds === undefined || seconds < metronomeStartSeconds) return { phase: "waiting" };
  // A hair of tolerance so a time exactly on a beat never reads as the previous one.
  const beatIndex = Math.floor((seconds - metronomeStartSeconds) / plan.beatSeconds + 1e-9);
  if (beatIndex < plan.countInBeats) return { phase: "count-in", beat: beatIndex + 1, beats: plan.countInBeats };
  const takeBeat = Math.min(beatIndex - plan.countInBeats, plan.recordingBeats - 1);
  return {
    phase: "recording", measure: Math.floor(takeBeat / plan.beatsPerMeasure) + 1, beat: (takeBeat % plan.beatsPerMeasure) + 1,
    measures: plan.recordingBeats / plan.beatsPerMeasure,
    takeSeconds: Math.max(0, seconds - metronomeStartSeconds - plan.countInSeconds),
  };
}

export function formatRecordingTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
