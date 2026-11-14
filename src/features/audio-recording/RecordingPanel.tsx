"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioCaptureError, planRecording, planTranscriptionCommit, recordingDownbeatSeconds, transcribeRecording,
  type AudioCaptureSession, type AudioTranscriptionPort, type RecordingPlan, type TranscribeResult, type TranscriptionTarget,
} from "@/application";
import { createMicrophoneCapture } from "@/adapters/web-audio";
import { applyEditCommand, type EditCommand } from "@/domain/commands";
import { letterName, spellMidiInKey, type NoteLabelMode } from "@/domain/music-theory";
import { estimateLivePitch, LIVE_PITCH_WINDOW_SECONDS, type LivePitch } from "@/domain/transcription";
import type { NoteEvent, Score } from "@/domain/score";
import { StaffView } from "@/features/score-editor";
import { formatRecordingTime, recordingProgress } from "./progress";

const button: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: "1px solid #c8cfdb", background: "#fff", cursor: "pointer" };
const panel: React.CSSProperties = { background: "#ffffff", border: "1px solid #d9dee8", borderRadius: 10, padding: 16, marginBottom: 16 };
const note: React.CSSProperties = { fontSize: 13, color: "#4a5568", margin: "4px 0" };
/** The level meter and beat display refresh at most this often; chunks arrive about every 11 ms. */
const DISPLAY_INTERVAL_MS = 50;
/** Candidate notes below this confidence are marked for checking (PRD MVP-003 low-confidence regions). */
export const LOW_CONFIDENCE = 0.8;

type PanelState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "recording"; plan: RecordingPlan; seconds: number; peak: number; metronomeStartSeconds?: number; live?: LivePitch | null }
  | { kind: "analyzing" }
  | { kind: "result"; result: TranscribeResult }
  | { kind: "error"; message: string };

/**
 * Humming capture (PRD MVP-002, P4-06). Recording and its PCM live only in this component's memory:
 * nothing is dispatched, saved or uploaded here. The take uses the Score's tempo and meter, locked when it starts.
 */
export function RecordingPanel({ score, cursorTick = null, labelMode = "none", port, onStart, onTranscribed, onCommand }: {
  score: Score;
  /** Edit cursor, for "insert from the cursor's measure". */
  cursorTick?: number | null;
  labelMode?: NoteLabelMode;
  /** The editor's single dispatch path. Returns an error message, or null on success. */
  onCommand?: (command: EditCommand) => string | null;
  /** Injected in tests; the browser microphone otherwise. */
  port?: AudioTranscriptionPort;
  /** Called before the microphone opens, e.g. to stop playback. */
  onStart?: () => void;
  onTranscribed?: (result: TranscribeResult) => void;
}) {
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const [consent, setConsent] = useState(false);
  const [metronome, setMetronome] = useState(true);
  const [target, setTarget] = useState<TranscriptionTarget>("end");
  const [notice, setNotice] = useState("");
  const [commitError, setCommitError] = useState("");
  const session = useRef<AudioCaptureSession | null>(null);
  const plan = useRef<RecordingPlan | null>(null);
  const settings = useRef<{ tempoBpm: number; score: Score } | null>(null);
  const lastPaint = useRef(0);
  const part = score.parts[0];
  const { numerator, denominator } = part.timeSignature;
  const preview = planRecording(score.tempoBpm, part.timeSignature);

  // Leaving the editor must release the microphone.
  useEffect(() => () => { session.current?.cancel(); session.current = null; }, []);

  const candidate = state.kind === "result" && state.result.ok ? state.result : null;
  // Read-only preview: the same command applied to the current Score. Nothing is dispatched until the user confirms.
  const previewed = useMemo(() => {
    if (!candidate) return null;
    let next = 0;
    const plan = planTranscriptionCommit(score, candidate.clipboard, { target, cursorTick, nextMeasureId: () => `preview-measure-${next++}` });
    if (!plan.ok) return { ok: false as const, message: plan.message };
    const result = applyEditCommand(score, plan.command);
    return result.ok ? { ok: true as const, score: result.score, startMeasure: plan.startMeasure } : { ok: false as const, message: result.error.message };
  }, [candidate, score, target, cursorTick]);

  function confirm() {
    if (!candidate || !onCommand) return;
    // Re-plan against the Score as it is now, with real IDs; the preview may be stale by a render.
    const plan = planTranscriptionCommit(score, candidate.clipboard, { target, cursorTick, nextMeasureId: () => crypto.randomUUID() });
    if (!plan.ok) { setCommitError(plan.message); return; }
    const error = onCommand(plan.command);
    if (error) { setCommitError(error); return; }
    setNotice(`${plan.startMeasure}마디부터 음표 ${candidate.notes.length}개를 넣었습니다. Undo로 한 번에 되돌릴 수 있습니다.`);
    setState({ kind: "idle" });
  }

  async function start() {
    onStart?.();
    setNotice(""); setCommitError("");
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
          // Display only: the same detector on the last ~0.1 s. Candidates still come from the whole take.
          const recent = session.current?.recent?.(LIVE_PITCH_WINDOW_SECONDS);
          let live: LivePitch | null = null;
          try { live = recent?.length ? estimateLivePitch(recent, session.current!.sampleRate) : null; } catch { live = null; }
          setState({ kind: "recording", plan: locked, seconds, peak, metronomeStartSeconds, live });
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
        템포와 박자는 다듬기 모드의 악보 설정에서 바꿀 수 있습니다.
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
          <span data-testid="recording-live-pitch" data-midi={state.live?.midi ?? ""} aria-live="off"
            style={{ fontSize: 13, minWidth: 140, fontVariantNumeric: "tabular-nums" }}>
            추정 음높이 {state.live
              ? `${letterName(spellMidiInKey(state.live.midi, part.keySignature))} ${state.live.cents >= 0 ? "+" : "−"}${Math.abs(state.live.cents)}센트`
              : "—"}
          </span>
          <button type="button" style={button} onClick={() => void session.current?.stop()}>녹음 정지</button>
          <button type="button" style={button} onClick={() => { session.current?.cancel(); }}>취소</button>
        </div>
      )}

      {state.kind === "analyzing" && <p role="status" style={note}>녹음을 분석하는 중입니다…</p>}

      {state.kind === "result" && (
        <p role="status" data-testid="recording-result" data-ok={String(state.result.ok)} style={{ ...note, color: state.result.ok ? "#1f2937" : "#b42318" }}>
          {state.result.ok ? `음표 ${state.result.notes.length}개를 찾았습니다. 확인한 뒤 악보에 넣어 주세요.` : state.result.message}
        </p>
      )}

      {candidate && (
        <div data-testid="recording-review" style={{ marginTop: 8 }}>
          <ol aria-label="채보 후보 음표" style={{ display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none", padding: 0, margin: "0 0 8px" }}>
            {candidate.clipboard.events.filter((event): event is NoteEvent => event.kind === "note").map((event) => {
              const low = (event.provenance?.confidence ?? 1) < LOW_CONFIDENCE;
              return (
                <li key={event.id} data-low-confidence={String(low)}
                  style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, border: `1px solid ${low ? "#d97706" : "#d9dee8"}`,
                    background: low ? "#fffbeb" : "#f7f8fa" }}>
                  {letterName(event.pitch)}{low ? <span aria-label="확인 필요"> ?</span> : null}
                </li>
              );
            })}
          </ol>
          {candidate.clipboard.events.some((event) => event.kind === "note" && (event.provenance?.confidence ?? 1) < LOW_CONFIDENCE) &&
            <p style={note}>?가 붙은 음은 분석 확신이 낮습니다. 넣은 뒤 확인해 주세요.</p>}
          <div role="radiogroup" aria-label="넣을 위치" style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "4px 0 8px", fontSize: 14 }}>
            <label><input type="radio" name="recording-target" checked={target === "end"} onChange={() => setTarget("end")} /> 악보 끝에 이어쓰기</label>
            <label><input type="radio" name="recording-target" checked={target === "cursor"} onChange={() => setTarget("cursor")} /> 커서가 있는 마디부터</label>
          </div>
          {previewed?.ok ? (
            <>
              <p style={note}>{previewed.startMeasure}마디부터 넣으면 아래와 같습니다(미리보기, 아직 저장되지 않음).</p>
              <div data-testid="recording-candidate"><StaffView score={previewed.score} labelMode={labelMode} /></div>
            </>
          ) : previewed ? <p role="alert" style={{ ...note, color: "#b42318" }}>{previewed.message}</p> : null}
          {commitError ? <p role="alert" style={{ ...note, color: "#b42318" }}>{commitError}</p> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" style={button} disabled={!previewed?.ok || !onCommand} onClick={confirm}>악보에 넣기</button>
            <button type="button" style={button} onClick={() => { setCommitError(""); setState({ kind: "idle" }); }}>후보 버리기</button>
          </div>
        </div>
      )}

      {notice ? <p role="status" data-testid="recording-notice" style={note}>{notice}</p> : null}

      {state.kind === "error" && <p role="alert" style={{ ...note, color: "#b42318" }}>{state.message}</p>}
    </section>
  );
}
