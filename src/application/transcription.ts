import { measureTicks } from "@/domain/score/create";
import { SUPPORTED_DENOMINATORS, TICKS_PER_QUARTER } from "@/domain/score/constants";
import type { ClipboardPayload } from "@/domain/score/clipboard";
import type { KeySignature, Score, TimeSignature } from "@/domain/score/types";
import type { EditCommand } from "@/domain/commands/types";
import {
  estimatePitchTrack, quantizeSegments, segmentNotes, transcriptionToClipboard, type QuantizedNote,
} from "@/domain/transcription";
import type { AudioRecording } from "./ports";

/** Recording limit in measures (decision 4, PRD MVP-003 upper bound). */
export const RECORDING_MAX_MEASURES = 8;
/** A recording whose loudest sample stays below this is treated as no input (about −40 dBFS). */
export const RECORDING_SILENCE_PEAK = 0.01;

/** Seconds of `measures` measures at the recording's tempo and meter. The count-in is not included. */
export function recordingLimitSeconds(tempoBpm: number, timeSignature: TimeSignature, measures = RECORDING_MAX_MEASURES): number {
  if (!Number.isFinite(tempoBpm) || tempoBpm <= 0) throw new RangeError(`Invalid tempo: ${tempoBpm}`);
  if (!Number.isInteger(timeSignature.numerator) || timeSignature.numerator < 1 ||
    !(SUPPORTED_DENOMINATORS as readonly number[]).includes(timeSignature.denominator)) {
    throw new RangeError(`Unsupported time signature: ${timeSignature.numerator}/${timeSignature.denominator}`);
  }
  if (!Number.isInteger(measures) || measures < 1) throw new RangeError(`Invalid measure count: ${measures}`);
  return (measures * measureTicks(timeSignature) / TICKS_PER_QUARTER) * (60 / tempoBpm);
}

/** Allowance for the click lead and the first chunk before the count-in starts, seconds. */
const RECORDING_START_ALLOWANCE_SECONDS = 0.5;

/** Count-in, click grid and length limit of one take. Clicks fall on the meter's beat unit, as in playback. */
export interface RecordingPlan {
  beatSeconds: number;
  beatsPerMeasure: number;
  countInBeats: number;
  recordingBeats: number;
  countInSeconds: number;
  /** The 8-measure limit of the take itself (decision 4). */
  limitSeconds: number;
  /** Capture length: start allowance + count-in + limit. */
  maxSeconds: number;
}

/** One measure of count-in, then up to `measures` measures. */
export function planRecording(tempoBpm: number, timeSignature: TimeSignature, measures = RECORDING_MAX_MEASURES): RecordingPlan {
  const limitSeconds = recordingLimitSeconds(tempoBpm, timeSignature, measures);
  const beatSeconds = (60 / tempoBpm) * (4 / timeSignature.denominator);
  const countInBeats = timeSignature.numerator;
  const countInSeconds = countInBeats * beatSeconds;
  return {
    beatSeconds, beatsPerMeasure: timeSignature.numerator, countInBeats, recordingBeats: measures * timeSignature.numerator,
    countInSeconds, limitSeconds, maxSeconds: RECORDING_START_ALLOWANCE_SECONDS + countInSeconds + limitSeconds,
  };
}

/** Recording time of tick 0: one count-in after the first click. Undefined when the take had no clicks. */
export function recordingDownbeatSeconds(recording: AudioRecording, plan: RecordingPlan): number | undefined {
  return recording.metronomeStartSeconds === undefined ? undefined : recording.metronomeStartSeconds + plan.countInSeconds;
}

export interface TranscribeSettings {
  tempoBpm: number;
  timeSignature: TimeSignature;
  /** Key of the target Part, used to spell pitches. */
  key: KeySignature;
  /** Recording time of tick 0 (end of the count-in). Default 0. */
  downbeatSeconds?: number;
  nextId: () => string;
}

export type TranscribeResult =
  | { ok: true; notes: QuantizedNote[]; clipboard: ClipboardPayload }
  | { ok: false; issue: "SILENT" | "NO_NOTES"; message: string };

/** Recording → candidate payload. Pure computation on the main thread (decision 2); the recording is not modified. */
export function transcribeRecording(recording: AudioRecording, settings: TranscribeSettings): TranscribeResult {
  let peak = 0;
  for (let index = 0; index < recording.samples.length; index += 1) peak = Math.max(peak, Math.abs(recording.samples[index]));
  if (peak < RECORDING_SILENCE_PEAK) {
    return { ok: false, issue: "SILENT", message: "소리가 녹음되지 않았습니다. 마이크 입력 레벨을 확인해 주세요." };
  }
  const segments = segmentNotes(estimatePitchTrack(recording.samples, recording.sampleRate));
  const quantized = quantizeSegments(segments, {
    tempoBpm: settings.tempoBpm, timeSignature: settings.timeSignature, downbeatSeconds: settings.downbeatSeconds ?? 0,
  });
  if (quantized.notes.length === 0) {
    return { ok: false, issue: "NO_NOTES", message: "음높이가 있는 음을 찾지 못했습니다. 조용한 곳에서 또렷하게 다시 불러 주세요." };
  }
  return {
    ok: true, notes: quantized.notes,
    clipboard: transcriptionToClipboard(quantized, { key: settings.key, timeSignature: settings.timeSignature, nextId: settings.nextId }),
  };
}

/** Where a confirmed take goes: after the last measure that holds an event, or at the start of the cursor's measure. */
export type TranscriptionTarget = "end" | "cursor";

export type TranscriptionCommitPlan =
  | { ok: true; command: Extract<EditCommand, { type: "PasteEvents" }>; startMeasure: number }
  | { ok: false; message: string };

/**
 * One PasteEvents command for a take (decision 5): measure-aligned, empty target only, and with the IDs of any measures
 * the take needs beyond the score's end, so the whole confirmation — new measures included — is one Undo step.
 */
export function planTranscriptionCommit(score: Score, clipboard: ClipboardPayload, options: {
  target: TranscriptionTarget; cursorTick: number | null; nextMeasureId: () => string;
}): TranscriptionCommitPlan {
  if (clipboard.events.length === 0 || clipboard.lengthTicks <= 0) return { ok: false, message: "악보에 넣을 음표가 없습니다." };
  const part = score.parts[0];
  const bar = measureTicks(part.timeSignature);
  let startTick: number;
  if (options.target === "cursor") {
    if (options.cursorTick === null) return { ok: false, message: "넣을 위치의 커서를 먼저 놓아 주세요." };
    startTick = Math.floor(options.cursorTick / bar) * bar;
  } else {
    const lastEnd = part.measures.flatMap((measure) => measure.events)
      .reduce((end, event) => Math.max(end, event.startTick + event.durationTicks), 0);
    startTick = Math.ceil(lastEnd / bar) * bar;
  }
  const needed = Math.max(0, Math.ceil((startTick + clipboard.lengthTicks - part.measures.length * bar) / bar));
  return {
    ok: true, startMeasure: startTick / bar + 1,
    command: { type: "PasteEvents", partId: part.id, startTick, clipboard,
      newMeasureIds: Array.from({ length: needed }, () => options.nextMeasureId()) },
  };
}
