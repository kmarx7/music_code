"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTranscribedScore, type AudioTranscriptionPort } from "@/application";
import type { ClipboardPayload, PlaybackPosition } from "@/domain/score";
import { StaffView } from "@/features/score-editor";
import { highlightPlayback, PlaybackControls } from "@/features/playback";
import { InstrumentRangeNote } from "./InstrumentRangeNote";
import { parseScoreSetup, ScoreSetupFields, SETUP_DEFAULTS, type ScoreSetup } from "@/features/score-setup";
import { CandidateChips, lowConfidenceCount, MicrophoneFields, takeCard, TakeProgressView, TakeStepList, useHummingTake } from "./take";

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
 * "악보 만들기"; the recording and its PCM live only in memory and are never saved or sent.
 */
export function HummingFlow({ onCreate, port }: HummingFlowProps) {
  const take = useHummingTake(port);
  // "setup" and "mic" are this flow's own screens; once recording starts, the take's state decides the screen.
  const [view, setView] = useState<"setup" | "mic" | "take">("setup");
  const [setup, setSetup] = useState<ScoreSetup>(defaultSetup);
  const [setupError, setSetupError] = useState("");
  const [consent, setConsent] = useState(false);
  const [metronome, setMetronome] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  // The settings the current take was recorded with.
  const [locked, setLocked] = useState<ScoreSetup>(setup);
  const pending = useRef(false);
  const previewRoot = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const t = take.state;
  const stepKind = view === "setup" ? "setup"
    : view === "mic" || t.kind === "idle" || t.kind === "failed" ? "mic"
    : t.kind === "done" ? "review" : t.kind;
  const index = { setup: 0, mic: 1, starting: 2, recording: 2, analyzing: 3, review: 3 }[stepKind];

  // Each later step announces itself: focus moves to its heading. The first step keeps the page's normal focus.
  const shownStep = useRef(index);
  useEffect(() => {
    if (shownStep.current === index) return;
    shownStep.current = index;
    heading.current?.focus({ preventScroll: false });
  }, [index]);

  const result = t.kind === "done" ? t.result : null;
  const candidate = result?.ok ? result : null;
  const preview = useMemo(() => {
    if (!candidate) return null;
    let next = 0;
    return buildTranscribedScore({ id: "preview", createdAt: new Date(0).toISOString(), setup: locked, clipboard: candidate.clipboard,
      nextId: () => `preview-measure-${next++}` });
  }, [candidate, locked]);
  const showPosition = useCallback((position: PlaybackPosition) => {
    if (previewRoot.current) highlightPlayback(previewRoot.current, position.activeNoteIds);
  }, []);

  function readSetup(form: HTMLFormElement): boolean {
    const data = new FormData(form);
    const parsed = parseScoreSetup({ title: data.get("title"), meter: data.get("meter"), tempo: data.get("tempo"), instrument: data.get("instrument") });
    if (!parsed.ok) { setSetupError(parsed.message); return false; }
    setSetup(parsed.setup); setSetupError("");
    return true;
  }

  function record() {
    setCreateError("");
    setLocked(setup);
    setView("take");
    void take.start(setup, metronome);
  }

  async function create() {
    if (!candidate || pending.current) return;
    pending.current = true; setCreating(true); setCreateError("");
    const error = await onCreate(locked, candidate.clipboard);
    if (error) { pending.current = false; setCreating(false); setCreateError(error); }
  }

  const lowCount = candidate ? lowConfidenceCount(candidate.clipboard) : 0;
  const micError = view === "take" && t.kind === "failed" ? t.message : undefined;

  return (
    <section data-testid="humming-flow" data-step={stepKind} aria-label="허밍으로 악보 만들기">
      <TakeStepList index={index} />

      {stepKind === "setup" && (
        <form noValidate onSubmit={(event) => { event.preventDefault(); if (readSetup(event.currentTarget)) setView("mic"); }}>
          <h1 ref={heading} tabIndex={-1} className="hb-title">어떤 악보를 만들까요?</h1>
          <ScoreSetupFields showKey={false} initial={setup} />
          <p className="hb-muted" style={{ marginTop: -8 }}>조성은 C장조로 시작하고, 편집기의 다듬기에서 바꿀 수 있습니다.</p>
          {setupError ? <p role="alert" className="hb-alert">{setupError}</p> : null}
          <div className="hb-actions">
            <button type="button" className="hb-btn" onClick={() => { setSetup(defaultSetup()); setSetupError(""); setView("mic"); }}>
              기본값으로 시작 ({SETUP_DEFAULTS.meter} · {SETUP_DEFAULTS.tempoBpm} BPM)
            </button>
            <button type="submit" className="hb-btn hb-btn-primary">다음</button>
          </div>
        </form>
      )}

      {stepKind === "mic" && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">마이크 준비</h1>
          <MicrophoneFields settings={setup} consent={consent} metronome={metronome} onConsent={setConsent} onMetronome={setMetronome} />
          {micError ? <p role="alert" className="hb-alert">{micError}</p> : null}
          <div className="hb-actions" style={{ marginTop: 12 }}>
            <button type="button" className="hb-btn" onClick={() => { take.reset(); setView("setup"); }}>이전</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={!consent} onClick={record}>녹음 시작</button>
          </div>
        </div>
      )}

      {(t.kind === "starting" || t.kind === "recording") && view === "take" && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">녹음</h1>
          <TakeProgressView state={t} keySignature={locked.keySignature} />
          <div className="hb-actions">
            <button type="button" className="hb-btn" onClick={take.cancel}>취소</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={t.kind !== "recording"} onClick={take.stop}>녹음 정지</button>
          </div>
        </div>
      )}

      {stepKind === "analyzing" && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">확인</h1>
          <p role="status">악보로 바꾸는 중…</p>
        </div>
      )}

      {result && view === "take" && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">확인</h1>
          <p role="status" data-testid="recording-result" data-ok={String(result.ok)} className={result.ok ? undefined : "hb-alert"}>
            {result.ok ? `음표 ${result.notes.length}개를 찾았습니다${lowCount ? ` · 확신 낮음 ${lowCount}개(?)` : ""}.` : result.message}
          </p>
          {candidate && preview?.ok ? (
            <>
              <CandidateChips clipboard={candidate.clipboard} />
              <div ref={previewRoot} data-testid="recording-candidate" style={takeCard}>
                <StaffView score={preview.score} />
              </div>
              <PlaybackControls score={preview.score} onPosition={showPosition} />
              <InstrumentRangeNote score={preview.score} />
            </>
          ) : preview && !preview.ok ? <p role="alert" className="hb-alert">{preview.message}</p> : null}
          {createError ? <p role="alert" className="hb-alert">{createError}</p> : null}
          <div className="hb-actions" style={{ marginTop: 12 }}>
            <button type="button" className="hb-btn" disabled={creating} onClick={record}>다시 녹음</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={!preview?.ok || creating} onClick={() => void create()}>악보 만들기</button>
          </div>
        </div>
      )}
    </section>
  );
}
