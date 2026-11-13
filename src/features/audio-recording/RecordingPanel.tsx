"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioCaptureError, planRecording, recordingDownbeatSeconds, transcribeRecording,
  type AudioCaptureSession, type AudioTranscriptionPort, type RecordingPlan, type TranscribeResult,
} from "@/application";
import { createMicrophoneCapture } from "@/adapters/web-audio";
import type { Score } from "@/domain/score";
import { formatRecordingTime, recordingProgress } from "./progress";

const button: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: "1px solid #c8cfdb", background: "#fff", cursor: "pointer" };
const panel: React.CSSProperties = { background: "#ffffff", border: "1px solid #d9dee8", borderRadius: 10, padding: 16, marginBottom: 16 };
const note: React.CSSProperties = { fontSize: 13, color: "#4a5568", margin: "4px 0" };
/** The level meter and beat display refresh at most this often; chunks arrive about every 11 ms. */
const DISPLAY_INTERVAL_MS = 50;

type PanelState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "recording"; plan: RecordingPlan; seconds: number; peak: number; metronomeStartSeconds?: number }
  | { kind: "analyzing" }
  | { kind: "result"; result: TranscribeResult }
  | { kind: "error"; message: string };

/**
 * Humming capture (PRD MVP-002, P4-06). Recording and its PCM live only in this component's memory:
 * nothing is dispatched, saved or uploaded here. The take uses the Score's tempo and meter, locked when it starts.
 */
export function RecordingPanel({ score, port, onStart, onTranscribed }: {
  score: Score;
  /** Injected in tests; the browser microphone otherwise. */
  port?: AudioTranscriptionPort;
  /** Called before the microphone opens, e.g. to stop playback. */
  onStart?: () => void;
  onTranscribed?: (result: TranscribeResult) => void;
}) {
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const [consent, setConsent] = useState(false);
  const [metronome, setMetronome] = useState(true);
  const session = useRef<AudioCaptureSession | null>(null);
  const plan = useRef<RecordingPlan | null>(null);
  const settings = useRef<{ tempoBpm: number; score: Score } | null>(null);
  const lastPaint = useRef(0);
  const part = score.parts[0];
  const { numerator, denominator } = part.timeSignature;
  const preview = planRecording(score.tempoBpm, part.timeSignature);

  // Leaving the editor must release the microphone.
  useEffect(() => () => { session.current?.cancel(); session.current = null; }, []);

  async function start() {
    onStart?.();
    const locked = planRecording(score.tempoBpm, part.timeSignature);
    plan.current = locked; settings.current = { tempoBpm: score.tempoBpm, score };
    setState({ kind: "starting" });
    try {
      const capture = port ?? createMicrophoneCapture();
      const started = await capture.startCapture({
        maxSeconds: locked.maxSeconds,
        metronome: { beatSeconds: locked.beatSeconds, beatsPerMeasure: locked.beatsPerMeasure, countInBeats: locked.countInBeats,
          recordingBeats: locked.recordingBeats, audibleDuringRecording: metronome },
        onLevel: ({ seconds, peak, metronomeStartSeconds }) => {
          const now = Date.now();
          if (now - lastPaint.current < DISPLAY_INTERVAL_MS) return;
          lastPaint.current = now;
          setState({ kind: "recording", plan: locked, seconds, peak, metronomeStartSeconds });
        },
      });
      session.current = started;
      setState({ kind: "recording", plan: locked, seconds: 0, peak: 0 });
      started.finished.then(analyze, fail);
    } catch (error) {
      fail(error);
    }
  }

  function fail(error: unknown) {
    session.current = null;
    // Cancelling is the user's own choice, not an error to report.
    if (error instanceof AudioCaptureError && error.code === "ABORTED") { setState({ kind: "idle" }); return; }
    setState({ kind: "error", message: error instanceof AudioCaptureError ? error.message : "녹음을 시작하지 못했습니다." });
  }

  function analyze(recording: Parameters<typeof recordingDownbeatSeconds>[0]) {
    session.current = null;
    setState({ kind: "analyzing" });
    // Let the "analyzing" state paint before the main-thread analysis runs (decision 2).
    setTimeout(() => {
      const locked = plan.current!, take = settings.current!;
      const takePart = take.score.parts[0];
      try {
        const result = transcribeRecording(recording, {
          tempoBpm: take.tempoBpm, timeSignature: takePart.timeSignature, key: takePart.keySignature,
          downbeatSeconds: recordingDownbeatSeconds(recording, locked), nextId: () => crypto.randomUUID(),
        });
        setState({ kind: "result", result });
        onTranscribed?.(result);
      } catch {
        setState({ kind: "error", message: "녹음을 분석하지 못했습니다. 다시 녹음해 주세요." });
      }
    }, 0);
  }

  const progress = state.kind === "recording" ? recordingProgress(state.seconds, state.metronomeStartSeconds, state.plan) : null;

  return (
    <section aria-label="허밍 녹음" data-testid="recording-panel" data-state={state.kind} style={panel}>
      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>허밍 녹음</h2>
      <p style={note}>
        악보 템포 {score.tempoBpm} BPM, {numerator}/{denominator}박자. 1마디 카운트인 후 최대 8마디({formatRecordingTime(preview.limitSeconds)})를 녹음합니다.
        템포와 박자는 위 악보 설정에서 바꿀 수 있습니다.
      </p>
      <p style={note}>녹음은 이 기기 안에서만 분석하며 저장하거나 전송하지 않습니다. 메트로놈 소리가 섞이지 않도록 이어폰을 권장합니다.</p>

      {(state.kind === "idle" || state.kind === "result" || state.kind === "error") && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
          <label style={{ fontSize: 14 }}>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> 마이크 사용과 기기 내 분석에 동의합니다
          </label>
          <label style={{ fontSize: 14 }}>
            <input type="checkbox" checked={metronome} onChange={(event) => setMetronome(event.target.checked)} /> 녹음 중 메트로놈
          </label>
          <button type="button" style={button} disabled={!consent} onClick={() => void start()}>
            {state.kind === "idle" ? "녹음 시작" : "다시 녹음"}
          </button>
        </div>
      )}

      {state.kind === "starting" && <p role="status" style={note}>마이크 권한을 요청하는 중입니다…</p>}

      {state.kind === "recording" && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
          <output role="status" data-testid="recording-progress" data-phase={progress?.phase} style={{ fontSize: 14, fontWeight: 600, minWidth: 180 }}>
            {progress?.phase === "count-in" ? `준비 ${progress.beat} / ${progress.beats}`
              : progress?.phase === "recording" ? `녹음 중 · ${progress.measure}마디 ${progress.beat}박`
              : "준비 중…"}
          </output>
          <span data-testid="recording-time" style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {formatRecordingTime(progress?.phase === "recording" ? progress.takeSeconds : 0)} / {formatRecordingTime(state.plan.limitSeconds)}
          </span>
          <label style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>입력 레벨
            <meter data-testid="recording-level" min={0} max={1} low={0.05} high={0.9} optimum={0.5} value={state.peak} />
          </label>
          <button type="button" style={button} onClick={() => void session.current?.stop()}>녹음 정지</button>
          <button type="button" style={button} onClick={() => { session.current?.cancel(); }}>취소</button>
        </div>
      )}

      {state.kind === "analyzing" && <p role="status" style={note}>녹음을 분석하는 중입니다…</p>}

      {state.kind === "result" && (
        <p role="status" data-testid="recording-result" data-ok={String(state.result.ok)} style={{ ...note, color: state.result.ok ? "#1f2937" : "#b42318" }}>
          {state.result.ok ? `음표 ${state.result.notes.length}개를 찾았습니다.` : state.result.message}
        </p>
      )}

      {state.kind === "error" && <p role="alert" style={{ ...note, color: "#b42318" }}>{state.message}</p>}
    </section>
  );
}
