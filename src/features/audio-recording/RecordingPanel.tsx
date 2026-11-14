"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { planTranscriptionCommit, type AudioTranscriptionPort, type TranscriptionTarget } from "@/application";
import { applyEditCommand, type EditCommand } from "@/domain/commands";
import type { NoteLabelMode } from "@/domain/music-theory";
import type { Score } from "@/domain/score";
import { StaffView } from "@/features/score-editor";
import {
  CandidateChips, lowConfidenceCount, MicrophoneFields, takeCard, TakeProgressView, TakeStepList, useHummingTake, type TakeSettings,
} from "./take";

export { LOW_CONFIDENCE } from "./take";

const heading: React.CSSProperties = { fontSize: 18, margin: "0 0 8px" };

export interface RecordingPanelProps {
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
  /** Each change opens the steps at ② with the consent box focused (the old "?start=hum" link). */
  openSignal?: number;
}

/**
 * "허밍 추가" (Phase 7 A-5): the same four steps as "허밍으로 시작", into the open score. ① 설정 is the score's own
 * tempo, meter and key, so the steps open at ② 마이크. ④ chooses the end or the cursor's measure and inserts the take
 * with one PasteEvents command (one Undo). Recording and PCM stay in memory; nothing is saved until ④.
 */
export function RecordingPanel({ score, cursorTick = null, labelMode = "none", port, onStart, onCommand, openSignal = 0 }: RecordingPanelProps) {
  const take = useHummingTake(port);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [metronome, setMetronome] = useState(true);
  const [target, setTarget] = useState<TranscriptionTarget>("end");
  const [notice, setNotice] = useState("");
  const [commitError, setCommitError] = useState("");
  const [locked, setLocked] = useState<TakeSettings | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  // The open request whose consent focus was already given.
  const usedSignal = useRef(0);
  const [seenSignal, setSeenSignal] = useState(0);
  if (openSignal !== seenSignal) { setSeenSignal(openSignal); if (openSignal) setOpen(true); }
  const addButton = useRef<HTMLButtonElement>(null);
  const part = score.parts[0];
  const settings: TakeSettings = { tempoBpm: score.tempoBpm, timeSignature: part.timeSignature, keySignature: part.keySignature };

  const t = take.state;
  const state = !open ? "idle"
    : t.kind === "idle" || t.kind === "failed" ? "mic"
    : t.kind === "done" ? "result" : t.kind;
  const index = { idle: -1, mic: 1, starting: 2, recording: 2, analyzing: 3, result: 3 }[state];

  // Each step announces itself by focusing its heading; closing returns focus to "허밍 추가".
  const shownStep = useRef(index);
  useEffect(() => {
    if (shownStep.current === index) return;
    const wasOpen = shownStep.current >= 0;
    shownStep.current = index;
    if (index < 0) { if (wasOpen) addButton.current?.focus(); return; }
    if (openSignal && usedSignal.current !== openSignal) {
      usedSignal.current = openSignal;
      const section = stepHeading.current?.closest("section");
      section?.scrollIntoView({ block: "start" });
      section?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus({ preventScroll: true });
      return;
    }
    stepHeading.current?.focus({ preventScroll: false });
  }, [index, openSignal]);

  const result = t.kind === "done" ? t.result : null;
  const candidate = open && result?.ok ? result : null;
  // Read-only preview: the same command applied to the current Score. Nothing is dispatched until the user confirms.
  const previewed = useMemo(() => {
    if (!candidate) return null;
    let next = 0;
    const plan = planTranscriptionCommit(score, candidate.clipboard, { target, cursorTick, nextMeasureId: () => `preview-measure-${next++}` });
    if (!plan.ok) return { ok: false as const, message: plan.message };
    const applied = applyEditCommand(score, plan.command);
    return applied.ok ? { ok: true as const, score: applied.score, startMeasure: plan.startMeasure } : { ok: false as const, message: applied.error.message };
  }, [candidate, score, target, cursorTick]);

  function openSteps() { setNotice(""); setCommitError(""); take.reset(); setOpen(true); }
  function close() { take.reset(); setCommitError(""); setOpen(false); }

  function record() {
    onStart?.();
    setNotice(""); setCommitError("");
    // The take keeps the settings it started with, even if the score changes while recording.
    setLocked(settings);
    void take.start(settings, metronome);
  }

  function confirm() {
    if (!candidate || !onCommand) return;
    // Re-plan against the Score as it is now, with real IDs; the preview may be stale by a render.
    const plan = planTranscriptionCommit(score, candidate.clipboard, { target, cursorTick, nextMeasureId: () => crypto.randomUUID() });
    if (!plan.ok) { setCommitError(plan.message); return; }
    const error = onCommand(plan.command);
    if (error) { setCommitError(error); return; }
    setNotice(`${plan.startMeasure}마디부터 음표 ${candidate.notes.length}개를 넣었습니다. Undo로 한 번에 되돌릴 수 있습니다.`);
    close();
  }

  const { numerator, denominator } = part.timeSignature;
  const lowCount = candidate ? lowConfidenceCount(candidate.clipboard) : 0;

  return (
    <section aria-label="허밍 추가" data-testid="recording-panel" data-state={state} style={takeCard}>
      {state === "idle" && (
        <>
          <h2 style={heading}>허밍 녹음</h2>
          <p className="hb-muted" style={{ margin: "0 0 12px" }}>
            흥얼거린 멜로디를 이 악보에 넣습니다. 악보 템포 {score.tempoBpm} BPM, {numerator}/{denominator}박자로 녹음합니다.
            템포와 박자는 다듬기 모드의 악보 설정에서 바꿀 수 있습니다.
          </p>
          <button ref={addButton} type="button" className="hb-btn hb-btn-primary" onClick={openSteps}>허밍 추가</button>
        </>
      )}

      {state !== "idle" && <TakeStepList index={index} />}

      {state === "mic" && (
        <div>
          <h2 ref={stepHeading} tabIndex={-1} style={heading}>마이크 준비</h2>
          <MicrophoneFields settings={settings} consent={consent} metronome={metronome} onConsent={setConsent} onMetronome={setMetronome} />
          {t.kind === "failed" && t.message ? <p role="alert" className="hb-alert">{t.message}</p> : null}
          <div className="hb-actions" style={{ marginTop: 12 }}>
            <button type="button" className="hb-btn" onClick={close}>닫기</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={!consent} onClick={record}>녹음 시작</button>
          </div>
        </div>
      )}

      {(t.kind === "starting" || t.kind === "recording") && open && (
        <div>
          <h2 ref={stepHeading} tabIndex={-1} style={heading}>녹음</h2>
          <TakeProgressView state={t} keySignature={(locked ?? settings).keySignature} />
          <div className="hb-actions">
            <button type="button" className="hb-btn" onClick={take.cancel}>취소</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={t.kind !== "recording"} onClick={take.stop}>녹음 정지</button>
          </div>
        </div>
      )}

      {state === "analyzing" && (
        <div>
          <h2 ref={stepHeading} tabIndex={-1} style={heading}>확인</h2>
          <p role="status">녹음을 분석하는 중입니다…</p>
        </div>
      )}

      {state === "result" && result && (
        <div>
          <h2 ref={stepHeading} tabIndex={-1} style={heading}>확인</h2>
          <p role="status" data-testid="recording-result" data-ok={String(result.ok)} className={result.ok ? undefined : "hb-alert"}>
            {result.ok ? `음표 ${result.notes.length}개를 찾았습니다${lowCount ? ` · 확신 낮음 ${lowCount}개(?)` : ""}. 넣을 위치를 고른 뒤 악보에 넣어 주세요.`
              : result.message}
          </p>
          {candidate && (
            <div data-testid="recording-review">
              <CandidateChips clipboard={candidate.clipboard} />
              {lowCount ? <p className="hb-muted" style={{ margin: "0 0 8px" }}>?가 붙은 음은 분석 확신이 낮습니다. 넣은 뒤 확인해 주세요.</p> : null}
              <div role="radiogroup" aria-label="넣을 위치" style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", margin: "4px 0 8px", fontSize: 15 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}>
                  <input type="radio" name="recording-target" checked={target === "end"} onChange={() => setTarget("end")} /> 악보 끝에 이어쓰기
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}>
                  <input type="radio" name="recording-target" checked={target === "cursor"} onChange={() => setTarget("cursor")} /> 커서가 있는 마디부터
                </label>
              </div>
              {previewed?.ok ? (
                <>
                  <p className="hb-muted" style={{ margin: "0 0 8px" }}>{previewed.startMeasure}마디부터 넣으면 아래와 같습니다(미리보기, 아직 저장되지 않음).</p>
                  <div data-testid="recording-candidate"><StaffView score={previewed.score} labelMode={labelMode} /></div>
                </>
              ) : previewed ? <p role="alert" className="hb-alert">{previewed.message}</p> : null}
            </div>
          )}
          {commitError ? <p role="alert" className="hb-alert">{commitError}</p> : null}
          <div className="hb-actions" style={{ marginTop: 12 }}>
            <button type="button" className="hb-btn" onClick={close}>후보 버리기</button>
            <button type="button" className="hb-btn" onClick={record}>다시 녹음</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={!previewed?.ok || !onCommand} onClick={confirm}>악보에 넣기</button>
          </div>
        </div>
      )}

      {notice ? <p role="status" data-testid="recording-notice" className="hb-muted" style={{ margin: "8px 0 0" }}>{notice}</p> : null}
    </section>
  );
}
