"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioCaptureError, planRecording, recordingDownbeatSeconds, transcribeRecording,
  type AudioCaptureSession, type AudioTranscriptionPort, type RecordingPlan, type TranscribeResult,
} from "@/application";
import { createMicrophoneCapture } from "@/adapters/web-audio";
import { letterName, spellMidiInKey } from "@/domain/music-theory";
import { estimateLivePitch, LIVE_PITCH_WINDOW_SECONDS, type LivePitch } from "@/domain/transcription";
import type { ClipboardPayload, KeySignature, NoteEvent, TimeSignature } from "@/domain/score";
import { formatRecordingTime, recordingProgress } from "./progress";

/** The level meter and beat display refresh at most this often; chunks arrive about every 11 ms. */
const DISPLAY_INTERVAL_MS = 50;
/** Candidate notes below this confidence are marked for checking (PRD MVP-003 low-confidence regions). */
export const LOW_CONFIDENCE = 0.8;
/** The four steps shared by "허밍으로 시작" and "허밍 추가" (Phase 7 decision 2). */
export const TAKE_STEPS = ["설정", "마이크", "녹음", "확인"] as const;
export const takeCard: React.CSSProperties = {
  background: "var(--hb-surface)", border: "1px solid var(--hb-border)", borderRadius: 10, padding: 16, marginBottom: 16,
};

export interface TakeSettings { tempoBpm: number; timeSignature: TimeSignature; keySignature: KeySignature }

export type TakeState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "recording"; plan: RecordingPlan; seconds: number; peak: number; metronomeStartSeconds?: number; live?: LivePitch | null }
  | { kind: "analyzing" }
  | { kind: "done"; result: TranscribeResult }
  /** `message` is absent when the user cancelled: that is their choice, not an error to report. */
  | { kind: "failed"; message?: string };

export interface HummingTake {
  state: TakeState;
  /** Opens the microphone and records one take with `settings` locked for its whole length. */
  start: (settings: TakeSettings, metronome: boolean) => Promise<void>;
  stop: () => void;
  cancel: () => void;
  /** Forgets the take (after it was used or dropped). */
  reset: () => void;
}

/**
 * One humming take: count-in, capture, live display, analysis. The recording and its PCM live only in this hook's
 * memory; nothing is dispatched, saved or uploaded here. Unmounting releases the microphone.
 */
export function useHummingTake(port?: AudioTranscriptionPort): HummingTake {
  const [state, setState] = useState<TakeState>({ kind: "idle" });
  const session = useRef<AudioCaptureSession | null>(null);
  const lastPaint = useRef(0);

  useEffect(() => () => { session.current?.cancel(); session.current = null; }, []);

  function fail(error: unknown) {
    session.current = null;
    if (error instanceof AudioCaptureError && error.code === "ABORTED") { setState({ kind: "failed" }); return; }
    setState({ kind: "failed", message: error instanceof AudioCaptureError ? error.message : "녹음을 시작하지 못했습니다." });
  }

  async function start(settings: TakeSettings, metronome: boolean) {
    const plan = planRecording(settings.tempoBpm, settings.timeSignature);
    setState({ kind: "starting" });
    const analyze = (recording: Parameters<typeof recordingDownbeatSeconds>[0]) => {
      session.current = null;
      setState({ kind: "analyzing" });
      // Let the "analyzing" state paint before the main-thread analysis runs.
      setTimeout(() => {
        try {
          setState({ kind: "done", result: transcribeRecording(recording, {
            tempoBpm: settings.tempoBpm, timeSignature: settings.timeSignature, key: settings.keySignature,
            downbeatSeconds: recordingDownbeatSeconds(recording, plan), nextId: () => crypto.randomUUID(),
          }) });
        } catch {
          setState({ kind: "failed", message: "녹음을 분석하지 못했습니다. 다시 녹음해 주세요." });
        }
      }, 0);
    };
    try {
      const capture = port ?? createMicrophoneCapture();
      const started = await capture.startCapture({
        maxSeconds: plan.maxSeconds,
        metronome: { beatSeconds: plan.beatSeconds, beatsPerMeasure: plan.beatsPerMeasure, countInBeats: plan.countInBeats,
          recordingBeats: plan.recordingBeats, audibleDuringRecording: metronome },
        onLevel: ({ seconds, peak, metronomeStartSeconds }) => {
          const now = Date.now();
          if (now - lastPaint.current < DISPLAY_INTERVAL_MS) return;
          lastPaint.current = now;
          // Display only: the same detector on the last ~0.1 s. Candidates still come from the whole take.
          const recent = session.current?.recent?.(LIVE_PITCH_WINDOW_SECONDS);
          let live: LivePitch | null = null;
          try { live = recent?.length ? estimateLivePitch(recent, session.current!.sampleRate) : null; } catch { live = null; }
          setState({ kind: "recording", plan, seconds, peak, metronomeStartSeconds, live });
        },
      });
      session.current = started;
      setState({ kind: "recording", plan, seconds: 0, peak: 0 });
      started.finished.then(analyze, fail);
    } catch (error) {
      fail(error);
    }
  }

  return {
    state,
    start,
    stop: () => void session.current?.stop(),
    cancel: () => session.current?.cancel(),
    reset: () => { session.current?.cancel(); session.current = null; setState({ kind: "idle" }); },
  };
}

/** The step list at the top of the start flows; steps before `index` are marked finished (✓). */
export function TakeStepList({ index, steps = TAKE_STEPS }: { index: number; steps?: readonly string[] }) {
  return (
    <ol aria-label="진행 단계" style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", listStyle: "none", padding: 0, margin: "0 0 16px", fontSize: 13 }}>
      {steps.map((label, position) => (
        <li key={label} aria-current={position === index ? "step" : undefined}
          style={{ color: position === index ? "var(--hb-accent)" : "var(--hb-muted)", fontWeight: position === index ? 700 : 400 }}>
          {position + 1} {label}{position < index ? " ✓" : ""}
        </li>
      ))}
    </ol>
  );
}

/** Step ② body shared by both flows: what will be recorded, privacy, consent and metronome. */
export function MicrophoneFields({ settings, consent, metronome, onConsent, onMetronome }: {
  settings: TakeSettings; consent: boolean; metronome: boolean;
  onConsent: (value: boolean) => void; onMetronome: (value: boolean) => void;
}) {
  const limit = planRecording(settings.tempoBpm, settings.timeSignature).limitSeconds;
  const { numerator, denominator } = settings.timeSignature;
  return (
    <>
      <div style={takeCard}>
        <p style={{ margin: "0 0 8px" }}>
          {settings.tempoBpm} BPM · {numerator}/{denominator}박자. 1마디 카운트인 뒤 최대 8마디({formatRecordingTime(limit)})를 녹음합니다.
        </p>
        <p className="hb-muted" style={{ margin: "0 0 4px" }}>녹음은 이 기기 안에서만 분석하며 저장하거나 전송하지 않습니다.</p>
        <p className="hb-muted" style={{ margin: 0 }}>메트로놈 소리가 섞이지 않도록 이어폰을 권장합니다.</p>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44, fontSize: 15 }}>
        <input type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} style={{ width: 20, height: 20 }} />
        마이크 사용과 기기 내 분석에 동의합니다
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44, fontSize: 15 }}>
        <input type="checkbox" checked={metronome} onChange={(event) => onMetronome(event.target.checked)} style={{ width: 20, height: 20 }} />
        녹음 중 메트로놈
      </label>
    </>
  );
}

/** Step ③ body: count-in / bar / beat, the live pitch, the input level and the time. */
export function TakeProgressView({ state, keySignature }: {
  state: Extract<TakeState, { kind: "starting" | "recording" }>; keySignature: KeySignature;
}) {
  if (state.kind === "starting") return <div style={{ ...takeCard, textAlign: "center" }}><p role="status" style={{ margin: 0 }}>마이크 권한을 요청하는 중입니다…</p></div>;
  const progress = recordingProgress(state.seconds, state.metronomeStartSeconds, state.plan);
  return (
    <div style={{ ...takeCard, textAlign: "center" }}>
      <output role="status" data-testid="recording-progress" data-phase={progress.phase}
        style={{ display: "block", fontSize: 17, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {progress.phase === "count-in" ? `준비 ${progress.beat} / ${progress.beats}`
          : progress.phase === "recording" ? `녹음 중 · ${progress.measure} / ${progress.measures}마디 · ${progress.beat}박`
          : "준비 중…"}
      </output>
      <p data-testid="recording-live-pitch" data-midi={state.live?.midi ?? ""} aria-live="off"
        style={{ fontSize: 32, fontWeight: 600, margin: "12px 0", fontVariantNumeric: "tabular-nums" }}>
        {state.live
          ? `${letterName(spellMidiInKey(state.live.midi, keySignature))} ${state.live.cents >= 0 ? "+" : "−"}${Math.abs(state.live.cents)}¢`
          : "—"}
      </p>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>입력 레벨
        <meter data-testid="recording-level" min={0} max={1} low={0.05} high={0.9} optimum={0.5} value={state.peak} style={{ width: 160 }} />
      </label>
      <p data-testid="recording-time" className="hb-muted" style={{ margin: "8px 0 0", fontVariantNumeric: "tabular-nums" }}>
        {formatRecordingTime(progress.phase === "recording" ? progress.takeSeconds : 0)} / {formatRecordingTime(state.plan.limitSeconds)}
      </p>
    </div>
  );
}

export function lowConfidenceCount(clipboard: ClipboardPayload): number {
  return clipboard.events.filter((event) => event.kind === "note" && (event.provenance?.confidence ?? 1) < LOW_CONFIDENCE).length;
}

/** Step ④: the candidate pitches as chips, low-confidence ones marked "?". */
export function CandidateChips({ clipboard }: { clipboard: ClipboardPayload }) {
  return (
    <ol aria-label="채보 후보 음표" style={{ display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none", padding: 0, margin: "0 0 8px" }}>
      {clipboard.events.filter((event): event is NoteEvent => event.kind === "note").map((event) => {
        const low = (event.provenance?.confidence ?? 1) < LOW_CONFIDENCE;
        return (
          <li key={event.id} data-low-confidence={String(low)}
            style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, border: `1px solid ${low ? "#d97706" : "var(--hb-border)"}`,
              background: low ? "#fffbeb" : "#f7f8fa" }}>
            {letterName(event.pitch)}{low ? <span aria-label="확인 필요"> ?</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
