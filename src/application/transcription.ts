import { measureTicks } from "@/domain/score/create";
import { SUPPORTED_DENOMINATORS, TICKS_PER_QUARTER } from "@/domain/score/constants";
import type { ClipboardPayload } from "@/domain/score/clipboard";
import type { KeySignature, TimeSignature } from "@/domain/score/types";
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
