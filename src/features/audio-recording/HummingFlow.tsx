"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioCaptureError, buildTranscribedScore, planRecording, recordingDownbeatSeconds, transcribeRecording,
  type AudioCaptureSession, type AudioTranscriptionPort, type RecordingPlan, type TranscribeResult,
} from "@/application";
import { createMicrophoneCapture } from "@/adapters/web-audio";
import { letterName, spellMidiInKey } from "@/domain/music-theory";
import { estimateLivePitch, LIVE_PITCH_WINDOW_SECONDS, type LivePitch } from "@/domain/transcription";
import type { ClipboardPayload, NoteEvent, PlaybackPosition } from "@/domain/score";
import { StaffView } from "@/features/score-editor";
import { highlightPlayback, PlaybackControls } from "@/features/playback";
import { parseScoreSetup, ScoreSetupFields, SETUP_DEFAULTS, type ScoreSetup } from "@/features/score-setup";
import { formatRecordingTime, recordingProgress } from "./progress";
import { LOW_CONFIDENCE } from "./RecordingPanel";

const DISPLAY_INTERVAL_MS = 50;
const STEPS = ["설정", "마이크", "녹음", "확인"] as const;
const card: React.CSSProperties = { background: "var(--hb-surface)", border: "1px solid var(--hb-border)", borderRadius: 10, padding: 16, marginBottom: 16 };

type Step =
  | { kind: "setup" }
  | { kind: "mic"; error?: string }
  | { kind: "starting" }
  | { kind: "recording"; plan: RecordingPlan; seconds: number; peak: number; metronomeStartSeconds?: number; live?: LivePitch | null }
  | { kind: "analyzing" }
  | { kind: "review"; result: TranscribeResult | { ok: false; message: string } };

const STEP_INDEX: Record<Step["kind"], number> = { setup: 0, mic: 1, starting: 2, recording: 2, analyzing: 3, review: 3 };

export interface HummingFlowProps {
  /** Called once with the step-1 settings and the confirmed take; resolves to an error message or null on success. */
  onCreate: (setup: ScoreSetup, clipboard: ClipboardPayload) => Promise<string | null>;
  /** Injected in tests; the browser microphone otherwise. */
  port?: AudioTranscriptionPort;
}

function defaultSetup(): ScoreSetup {
  const parsed = parseScoreSetup({});
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.setup;
}

/**
 * Humming start (Phase 7 decision 2): ① settings ② microphone ③ record ④ review. Nothing is stored before
 * "악보 만들기"; the recording and its PCM live only in this component's memory and are never saved or sent.
 */
export function HummingFlow({ onCreate, port }: HummingFlowProps) {
  const [step, setStep] = useState<Step>({ kind: "setup" });
  const [setup, setSetup] = useState<ScoreSetup>(defaultSetup);
  const [setupError, setSetupError] = useState("");
  const [consent, setConsent] = useState(false);
  const [metronome, setMetronome] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const session = useRef<AudioCaptureSession | null>(null);
  const locked = useRef<{ plan: RecordingPlan; setup: ScoreSetup } | null>(null);
  const lastPaint = useRef(0);
  const pending = useRef(false);
  const previewRoot = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const index = STEP_INDEX[step.kind];

  // Leaving the page releases the microphone and drops the take.
  useEffect(() => () => { session.current?.cancel(); session.current = null; }, []);
  // Each later step announces itself: focus moves to its heading. The first step keeps the page's normal focus.
  const shownStep = useRef(index);
  useEffect(() => {
    if (shownStep.current === index) return;
    shownStep.current = index;
    heading.current?.focus({ preventScroll: false });
  }, [index]);

  const candidate = step.kind === "review" && step.result.ok ? step.result : null;
  const preview = useMemo(() => {
    if (!candidate) return null;
    let next = 0;
    return buildTranscribedScore({ id: "preview", createdAt: new Date(0).toISOString(), setup, clipboard: candidate.clipboard,
      nextId: () => `preview-measure-${next++}` });
  }, [candidate, setup]);
  const showPosition = useCallback((position: PlaybackPosition) => {
    if (previewRoot.current) highlightPlayback(previewRoot.current, position.activeNoteIds);
  }, []);

  function readSetup(form: HTMLFormElement): boolean {
    const data = new FormData(form);
    const parsed = parseScoreSetup({ title: data.get("title"), meter: data.get("meter"), tempo: data.get("tempo") });
    if (!parsed.ok) { setSetupError(parsed.message); return false; }
    setSetup(parsed.setup); setSetupError("");
    return true;
  }

  async function record() {
    setCreateError("");
    const plan = planRecording(setup.tempoBpm, setup.timeSignature);
    locked.current = { plan, setup };
    setStep({ kind: "starting" });
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
          const recent = session.current?.recent?.(LIVE_PITCH_WINDOW_SECONDS);
          let live: LivePitch | null = null;
          try { live = recent?.length ? estimateLivePitch(recent, session.current!.sampleRate) : null; } catch { live = null; }
          setStep({ kind: "recording", plan, seconds, peak, metronomeStartSeconds, live });
        },
      });
      session.current = started;
      setStep({ kind: "recording", plan, seconds: 0, peak: 0 });
      started.finished.then(analyze, fail);
    } catch (error) {
      fail(error);
    }
  }

  function fail(error: unknown) {
    session.current = null;
    // Cancelling is the user's own choice: back to the microphone step without a message.
    if (error instanceof AudioCaptureError && error.code === "ABORTED") { setStep({ kind: "mic" }); return; }
    setStep({ kind: "mic", error: error instanceof AudioCaptureError ? error.message : "녹음을 시작하지 못했습니다." });
  }

  function analyze(recording: Parameters<typeof recordingDownbeatSeconds>[0]) {
    session.current = null;
    setStep({ kind: "analyzing" });
    setTimeout(() => {
      const take = locked.current!;
      try {
        const result = transcribeRecording(recording, {
          tempoBpm: take.setup.tempoBpm, timeSignature: take.setup.timeSignature, key: take.setup.keySignature,
          downbeatSeconds: recordingDownbeatSeconds(recording, take.plan), nextId: () => crypto.randomUUID(),
        });
        setStep({ kind: "review", result });
      } catch {
        setStep({ kind: "review", result: { ok: false, message: "녹음을 분석하지 못했습니다. 다시 녹음해 주세요." } });
      }
    }, 0);
  }

  async function create() {
    if (!candidate || pending.current) return;
    pending.current = true; setCreating(true); setCreateError("");
    const error = await onCreate(setup, candidate.clipboard);
    if (error) { pending.current = false; setCreating(false); setCreateError(error); }
  }

  const progress = step.kind === "recording" ? recordingProgress(step.seconds, step.metronomeStartSeconds, step.plan) : null;
  const lowCount = candidate?.clipboard.events.filter((event) => event.kind === "note" && (event.provenance?.confidence ?? 1) < LOW_CONFIDENCE).length ?? 0;
  const limit = planRecording(setup.tempoBpm, setup.timeSignature).limitSeconds;

  return (
    <section data-testid="humming-flow" data-step={step.kind} aria-label="허밍으로 악보 만들기">
      <ol aria-label="진행 단계" style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", listStyle: "none", padding: 0, margin: "0 0 16px", fontSize: 13 }}>
        {STEPS.map((label, position) => (
          <li key={label} aria-current={position === index ? "step" : undefined}
            style={{ color: position === index ? "var(--hb-accent)" : "var(--hb-muted)", fontWeight: position === index ? 700 : 400 }}>
            {position + 1} {label}{position < index ? " ✓" : ""}
          </li>
        ))}
      </ol>

      {step.kind === "setup" && (
        <form noValidate onSubmit={(event) => { event.preventDefault(); if (readSetup(event.currentTarget)) setStep({ kind: "mic" }); }}>
          <h1 ref={heading} tabIndex={-1} className="hb-title">어떤 악보를 만들까요?</h1>
          <ScoreSetupFields showKey={false} initial={setup} />
          <p className="hb-muted" style={{ marginTop: -8 }}>조성은 C장조로 시작하고, 편집기의 다듬기에서 바꿀 수 있습니다.</p>
          {setupError ? <p role="alert" className="hb-alert">{setupError}</p> : null}
          <div className="hb-actions">
            <button type="button" className="hb-btn" onClick={() => { setSetup(defaultSetup()); setSetupError(""); setStep({ kind: "mic" }); }}>
              기본값으로 시작 ({SETUP_DEFAULTS.meter} · {SETUP_DEFAULTS.tempoBpm} BPM)
            </button>
            <button type="submit" className="hb-btn hb-btn-primary">다음</button>
          </div>
        </form>
      )}

      {step.kind === "mic" && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">마이크 준비</h1>
          <div style={card}>
            <p style={{ margin: "0 0 8px" }}>
              {setup.tempoBpm} BPM · {setup.timeSignature.numerator}/{setup.timeSignature.denominator}박자. 1마디 카운트인 뒤 최대 8마디({formatRecordingTime(limit)})를 녹음합니다.
            </p>
            <p className="hb-muted" style={{ margin: "0 0 4px" }}>녹음은 이 기기 안에서만 분석하며 저장하거나 전송하지 않습니다.</p>
            <p className="hb-muted" style={{ margin: 0 }}>메트로놈 소리가 섞이지 않도록 이어폰을 권장합니다.</p>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44, fontSize: 15 }}>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} style={{ width: 20, height: 20 }} />
            마이크 사용과 기기 내 분석에 동의합니다
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44, fontSize: 15 }}>
            <input type="checkbox" checked={metronome} onChange={(event) => setMetronome(event.target.checked)} style={{ width: 20, height: 20 }} />
            녹음 중 메트로놈
          </label>
          {step.error ? <p role="alert" className="hb-alert">{step.error}</p> : null}
          <div className="hb-actions" style={{ marginTop: 12 }}>
            <button type="button" className="hb-btn" onClick={() => setStep({ kind: "setup" })}>이전</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={!consent} onClick={() => void record()}>녹음 시작</button>
          </div>
        </div>
      )}

      {(step.kind === "starting" || step.kind === "recording") && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">녹음</h1>
          <div style={{ ...card, textAlign: "center" }}>
            {step.kind === "starting" ? <p role="status" style={{ margin: 0 }}>마이크 권한을 요청하는 중입니다…</p> : (
              <>
                <output role="status" data-testid="recording-progress" data-phase={progress?.phase}
                  style={{ display: "block", fontSize: 17, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {progress?.phase === "count-in" ? `준비 ${progress.beat} / ${progress.beats}`
                    : progress?.phase === "recording" ? `녹음 중 · ${progress.measure} / ${progress.measures}마디 · ${progress.beat}박`
                    : "준비 중…"}
                </output>
                <p data-testid="recording-live-pitch" data-midi={step.live?.midi ?? ""} aria-live="off"
                  style={{ fontSize: 32, fontWeight: 600, margin: "12px 0", fontVariantNumeric: "tabular-nums" }}>
                  {step.live
                    ? `${letterName(spellMidiInKey(step.live.midi, setup.keySignature))} ${step.live.cents >= 0 ? "+" : "−"}${Math.abs(step.live.cents)}¢`
                    : "—"}
                </p>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>입력 레벨
                  <meter data-testid="recording-level" min={0} max={1} low={0.05} high={0.9} optimum={0.5} value={step.peak} style={{ width: 160 }} />
                </label>
                <p data-testid="recording-time" className="hb-muted" style={{ margin: "8px 0 0", fontVariantNumeric: "tabular-nums" }}>
                  {formatRecordingTime(progress?.phase === "recording" ? progress.takeSeconds : 0)} / {formatRecordingTime(step.plan.limitSeconds)}
                </p>
              </>
            )}
          </div>
          <div className="hb-actions">
            <button type="button" className="hb-btn" onClick={() => { session.current?.cancel(); }}>취소</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={step.kind !== "recording"}
              onClick={() => void session.current?.stop()}>녹음 정지</button>
          </div>
        </div>
      )}

      {step.kind === "analyzing" && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">확인</h1>
          <p role="status">악보로 바꾸는 중…</p>
        </div>
      )}

      {step.kind === "review" && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">확인</h1>
          <p role="status" data-testid="recording-result" data-ok={String(step.result.ok)}
            className={step.result.ok ? undefined : "hb-alert"}>
            {step.result.ok ? `음표 ${step.result.notes.length}개를 찾았습니다${lowCount ? ` · 확신 낮음 ${lowCount}개(?)` : ""}.`
              : step.result.message}
          </p>
          {candidate && preview?.ok ? (
            <>
              <ol aria-label="채보 후보 음표" style={{ display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none", padding: 0, margin: "0 0 8px" }}>
                {candidate.clipboard.events.filter((event): event is NoteEvent => event.kind === "note").map((event) => {
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
              <div ref={previewRoot} data-testid="recording-candidate" style={card}><StaffView score={preview.score} /></div>
              <PlaybackControls score={preview.score} onPosition={showPosition} />
            </>
          ) : preview && !preview.ok ? <p role="alert" className="hb-alert">{preview.message}</p> : null}
          {createError ? <p role="alert" className="hb-alert">{createError}</p> : null}
          <div className="hb-actions" style={{ marginTop: 12 }}>
            <button type="button" className="hb-btn" disabled={creating} onClick={() => void record()}>다시 녹음</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={!preview?.ok || creating} onClick={() => void create()}>악보 만들기</button>
          </div>
        </div>
      )}
    </section>
  );
}
