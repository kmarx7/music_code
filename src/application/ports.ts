import type { Score } from "@/domain/score/types";
import type { NotationIssue } from "@/domain/score/notation";

export interface ScoreSummary {
  id: string;
  title: string;
  updatedAt: string;
  revision: number;
}

/** Storage metadata is not music content and never enters edit history/JSON backups. */
export interface ScoreSnapshot { score: Score; revision: number }
export interface ScoreChange { id: string; revision: number; kind: "saved" | "deleted" }
export interface ScoreRepository {
  list(): Promise<ScoreSummary[]>;
  /** Read-only compatibility projection. null means truly absent, never deleted/unreadable. */
  load(id: string): Promise<Score | null>;
  read(id: string): Promise<ScoreSnapshot | null>;
  create(score: Score): Promise<number>;
  save(score: Score, expectedRevision: number): Promise<number>;
  delete(id: string, expectedRevision: number): Promise<number>;
  subscribe?(listener: (change: ScoreChange) => void): () => void;
}
export class ScoreConflictError extends Error {
  constructor(public readonly code: "CONFLICT" | "DELETED", message = "다른 탭에서 악보가 변경되거나 삭제되었습니다.") {
    super(message); this.name = "ScoreConflictError";
  }
}

export type ScoreReadErrorCode =
  | "INVALID_RECORD"
  | "INVALID_JSON"
  | "INVALID_SHAPE"
  | "INVALID_SCORE"
  | "UNSUPPORTED_SCHEMA"
  | "STORAGE_READ_ERROR";

/** Storage failures are never equivalent to a missing score. No raw data is rewritten. */
export class ScoreReadError extends Error {
  constructor(public readonly code: ScoreReadErrorCode, message: string) {
    super(message);
    this.name = "ScoreReadError";
  }
}

/** Why a microphone capture could not start or did not finish. */
export type AudioCaptureErrorCode =
  | "UNSUPPORTED"        // no getUserMedia / AudioWorklet in this browser or context
  | "PERMISSION_DENIED"  // the user or the page context refused the microphone
  | "NO_DEVICE"          // no input device matches
  | "DEVICE_BUSY"        // the device exists but could not be opened
  | "DEVICE_LOST"        // the input went away while recording
  | "ABORTED"            // cancelled by the caller
  | "FAILED";            // anything else while setting up audio

export class AudioCaptureError extends Error {
  constructor(public readonly code: AudioCaptureErrorCode, message: string) {
    super(message);
    this.name = "AudioCaptureError";
  }
}

/** Mono PCM held in memory only. Never stored in a Score, JSON, history or IndexedDB, and never uploaded. */
export interface AudioRecording {
  samples: Float32Array;
  sampleRate: number;
  durationSeconds: number;
  stoppedBy: "user" | "limit";
  /** Recording time of the first count-in click, latency the browser reports included. Absent without a metronome. */
  metronomeStartSeconds?: number;
}

/** Count-in (always audible) and optional metronome, scheduled on the capture clock so beats and samples share one time base. */
export interface CaptureMetronome {
  beatSeconds: number;
  /** The first beat of every measure is accented. */
  beatsPerMeasure: number;
  countInBeats: number;
  /** Beats after the count-in (the recording itself). */
  recordingBeats: number;
  audibleDuringRecording: boolean;
}

export interface CaptureProgress {
  /** Level of the latest chunk, 0–1 full scale. */
  rms: number;
  peak: number;
  /** Seconds captured so far. */
  seconds: number;
  /** Recording time of the first click, once it is scheduled. */
  metronomeStartSeconds?: number;
}

export interface AudioCaptureOptions {
  /** Recording stops by itself after this many seconds (count-in plus the measure limit). */
  maxSeconds: number;
  /** Called for each captured chunk. */
  onLevel?: (progress: CaptureProgress) => void;
  metronome?: CaptureMetronome;
  signal?: AbortSignal;
}

export interface AudioCaptureSession {
  readonly sampleRate: number;
  /** Settles when recording ends: by `stop()`, by the limit, or with an AudioCaptureError. */
  readonly finished: Promise<AudioRecording>;
  /** Ends the recording and releases the device. Calling it again returns the same result. */
  stop(): Promise<AudioRecording>;
  /** Discards the recording and releases the device; `finished` rejects with ABORTED. */
  cancel(): void;
}

/** Microphone capture for transcription (Phase 4, decision 8). Analysis itself is pure Domain code. */
export interface AudioTranscriptionPort {
  startCapture(options: AudioCaptureOptions): Promise<AudioCaptureSession>;
}

// ---- Phase 5 export (D-03, 2026-11-13) ----

/** File formats a score can leave the app in. JSON is the backup; the others are standard outputs. */
export type ExportFormat = "json" | "midi" | "musicxml" | "pdf";

export interface ExportIssue {
  readonly code: "INVALID_SCORE" | NotationIssue["code"];
  readonly message: string;
  readonly measureNumber?: number;
  readonly eventId?: string;
}

export type ExportData = Uint8Array | string;

export type ExportWriteResult =
  | { readonly ok: true; readonly data: ExportData }
  | { readonly ok: false; readonly issue: ExportIssue };

/** A format writer (adapter). It reads the score and returns bytes or text; it never stores or edits anything. */
export interface ExportPort {
  readonly format: Exclude<ExportFormat, "json" | "pdf">;
  readonly mimeType: string;
  write(score: Readonly<Score>): ExportWriteResult;
}
