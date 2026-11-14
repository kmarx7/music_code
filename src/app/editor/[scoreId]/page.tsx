"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Pitch } from "@/domain/score/types";
import { formatNoteLabel, koreanFixedDo, letterName, type NoteLabelMode } from "@/domain/music-theory";
import { ScoreConflictError, ScoreReadError, importScoreBackup, exportScoreBackup, openOrCreateScore, planAppendNote, planAppendRest, planNoteAt, probeScoreStorage } from "@/application";
import { createEmptyScore, measureTicks, TICKS_PER_QUARTER } from "@/domain/score";
import { downloadScoreJson } from "@/adapters/file-export/json";
import { createUnavailableScoreRepository, getScoreRepository } from "@/adapters/indexeddb";
import { scoreStore } from "@/store/score-store";
import { useScoreState } from "@/store/useScoreStore";
import { ClipboardControls, EditCursor, NoteLabelsControl, RangeSelect, ScoreSettings, StaffView } from "@/features/score-editor";
import { midiToPitch, PianoKeyboard } from "@/features/piano-input";
import { SaveButton, useAutosave, type AutosaveHandle } from "@/features/score-library";
import { PlaybackControls, highlightPlayback } from "@/features/playback";
import { TransposeTool } from "@/features/transposition";
import { RecordingPanel } from "@/features/audio-recording";
import { ExportControls } from "@/features/export";
import type { ClipboardPayload, PlaybackPosition, RangeSelection, Score } from "@/domain/score";
import type { EditCommand } from "@/domain/commands";

const noSubscription = () => () => {};
const readStartParam = () => new URLSearchParams(window.location.search).get("start");

const DURATIONS = [
  { label: "온음표", ticks: 3840 },
  { label: "2분음표", ticks: 1920 },
  { label: "4분음표", ticks: 960 },
  { label: "8분음표", ticks: 480 },
];

const page: React.CSSProperties = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: 24,
  fontFamily:
    "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif",
};

const button: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #c8cfdb",
  background: "#ffffff",
  cursor: "pointer",
  fontSize: 13,
};

const buttonActive: React.CSSProperties = {
  ...button,
  background: "#1b2a4a",
  borderColor: "#1b2a4a",
  color: "#ffffff",
};

/** Phase 7 decision 4: one work mode at a time, on every screen size. UI state only — never stored. */
type EditorMode = "input" | "edit" | "play" | "file";
const EDITOR_MODES: readonly { id: EditorMode; label: string }[] = [
  { id: "input", label: "입력" }, { id: "edit", label: "다듬기" }, { id: "play", label: "연습" }, { id: "file", label: "내보내기" },
];
/**
 * Layout (A-1 shape): header → staff (always visible) → mode bar → the chosen mode's tools. Inactive mode panels are
 * hidden, never unmounted, so recording, playback and form state survive a mode switch. On phones the mode bar is
 * fixed to the bottom edge for the thumb.
 */
const EDITOR_CSS = `
.editor-main { max-width: 1000px; margin: 0 auto; padding: 16px 24px 48px; font-family: var(--hb-font); }
.editor-header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 12px; }
.editor-header h1 { font-size: 20px; margin: 0; overflow-wrap: anywhere; min-width: 0; }
.editor-header .editor-header-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }
.editor-staff-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.editor-staff-view { max-height: min(60vh, 560px); overflow: auto; }
.editor-modes { display: flex; gap: 4px; margin: 16px 0 12px; padding: 4px; background: #e9ecf3; border-radius: 10px; }
.editor-modes [role="tab"] { flex: 1 1 0; min-height: 44px; border: 0; border-radius: 8px; background: transparent;
  color: var(--hb-text); font-size: 15px; cursor: pointer; }
.editor-modes [role="tab"][aria-selected="true"] { background: var(--hb-surface); color: var(--hb-accent); font-weight: 600;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08), 0 0 0 1px var(--hb-border); }
.editor-modes [role="tab"]:focus-visible { outline: 3px solid #7fb2ff; outline-offset: 1px; }
@media (max-width: 768px) {
  .editor-main { padding: 12px 12px calc(88px + env(safe-area-inset-bottom)); }
  .editor-staff-view { max-height: none; }
  .editor-modes { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; margin: 0; border-radius: 0;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom)); background: var(--hb-surface); border-top: 1px solid var(--hb-border); }
}
`;

const panel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d9dee8",
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
};

export default function EditorPage() {
  const params = useParams<{ scoreId: string }>();
  const scoreId = params?.scoreId ?? "demo-score";
  return <EditorLoader key={scoreId} scoreId={scoreId} />;
}

/** The editing workspace and autosave only mount after a successful validated read. */
function EditorLoader({ scoreId }: { scoreId: string }) {
  const [load, setLoad] = useState<{ ready: boolean; revision?: number; memoryOnly?: boolean; error?: { code: string; message: string } }>({ ready: false });
  const repository = getScoreRepository();
  useEffect(() => {
    let active = true;
    openOrCreateScore(repository, { id: scoreId, createdAt: new Date().toISOString() })
      .then(({ score, revision }) => {
        if (!active) return;
        scoreStore.init(score);
        setLoad({ ready: true, revision });
      })
      .catch(async (error: unknown) => {
        if (!active) return;
        // Storage that cannot be opened at all (P6-05): edit in memory, never claim a save. A single unreadable
        // record is different — the library still lists — and stays blocked below so it is never overwritten.
        const storageDown = !(error instanceof ScoreConflictError) &&
          (!(error instanceof ScoreReadError) || error.code === "STORAGE_READ_ERROR") && !(await probeScoreStorage(repository));
        if (!active) return;
        if (storageDown) {
          scoreStore.init(createEmptyScore({ id: scoreId, title: "새 악보", measureCount: 8, createdAt: new Date().toISOString() }));
          setLoad({ ready: true, revision: 0, memoryOnly: true });
          return;
        }
        setLoad({ ready: false, error: error instanceof ScoreReadError || error instanceof ScoreConflictError
          ? { code: error.code, message: error.message }
          : { code: "OPEN_FAILED", message: "악보를 열지 못했습니다." } });
      });
    return () => { active = false; };
  }, [repository, scoreId]);
  if (load.error) return (
    <main style={page} data-testid="score-open-error">
      <h1>악보를 열 수 없습니다</h1>
      <p role="alert">{load.error.code}: {load.error.message}</p>
      <p>저장본을 변경하지 않았습니다. 새 악보 생성과 자동 저장을 시작하지 않습니다.</p>
      <Link href="/library">악보함으로 돌아가기</Link>
    </main>
  );
  if (!load.ready) return <main style={page}><p>준비 중…</p></main>;
  return <EditorWorkspace key={scoreId} initialRevision={load.revision!} memoryOnly={load.memoryOnly ?? false} />;
}

function EditorWorkspace({ initialRevision, memoryOnly }: { initialRevision: number; memoryOnly: boolean }) {
  const router = useRouter();
  const session = useScoreState();
  const [durationTicks, setDurationTicks] = useState(960);
  const [cursorTick, setCursorTick] = useState<number | null>(null);
  const cursorRef = useRef<number | null>(null);
  const moveCursor = useCallback((tick: number | null) => {
    cursorRef.current = tick; setCursorTick(tick);
  }, []);
  const [labelMode, setLabelMode] = useState<NoteLabelMode>("none");
  // Work mode (decision 4): UI state only, never stored. Old "?start=" links open the input mode.
  const [mode, setMode] = useState<EditorMode>("input");
  const [renaming, setRenaming] = useState(false);
  const modeTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [message, setMessage] = useState("");
  const [playbackStopSignal, setPlaybackStopSignal] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // Range selection is local UI state bound to the exact Score it was derived from (never stored).
  const [rangeState, setRangeState] = useState<{ score: Score; selection: RangeSelection } | null>(null);
  // Any edit/Undo/Redo replaces the Score: drop the selection for good so Undo cannot revive a stale one.
  if (rangeState && rangeState.score !== session?.current) setRangeState(null);
  // In-memory clipboard for this editor mount only (C-08): never stored in Score, JSON or history.
  const [clipboard, setClipboard] = useState<ClipboardPayload | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const showPosition = useCallback((position: PlaybackPosition) => {
    if (rootRef.current) highlightPlayback(rootRef.current, position.activeNoteIds);
  }, []);
  const [unavailable] = useState(() => (memoryOnly ? createUnavailableScoreRepository() : null));
  const repository = unavailable ?? getScoreRepository();
  const autosave = useRef<AutosaveHandle | null>(null);
  const navigationPending = useRef(false);
  const saveStatus = useAutosave(repository, 400, autosave, true, initialRevision);

  // Entry links: "?start=piano" (from /new) brings the keyboard into view; the old "?start=hum" opens "허밍 추가"
  // at ② 마이크 with its consent box focused. Both open the input mode. Nothing records by itself.
  // The server renders without the query; the client reads it once after hydration.
  const start = useSyncExternalStore(noSubscription, readStartParam, () => null);
  useEffect(() => {
    if (start === "piano") document.getElementById("piano-input")?.scrollIntoView({ block: "center" });
  }, [start]);

  async function leaveEditor(href: string) {
    if (navigationPending.current) return;
    navigationPending.current = true;
    try {
      if (!await autosave.current?.flush()) {
        setMessage("저장하지 못해 이동을 중단했습니다. 다시 시도하거나 JSON 백업을 다운로드해 주세요.");
        return;
      }
      if (autosave.current) router.push(href);
    } finally {
      navigationPending.current = false;
    }
  }

  async function saveAsNew() {
    const current = scoreStore.getState()?.current;
    if (!current) return;
    try {
      const { score } = await importScoreBackup(repository, exportScoreBackup(current).json,
        { id: crypto.randomUUID(), importedAt: new Date().toISOString() });
      router.push(`/editor/${score.id}`);
    } catch { setMessage("새 악보 저장에 실패했습니다. 현재 내용을 JSON으로 백업해 주세요."); }
  }
  async function openLatest() {
    if (!window.confirm("현재 메모리 편집과 Undo 이력을 버리고 최신 저장본을 열까요? 먼저 JSON 백업을 권장합니다.")) return;
    try {
      const current = scoreStore.getState()?.current;
      if (!current) return;
      if (!await repository.read(current.id)) throw new Error("저장본 없음");
      autosave.current?.allowDiscard?.();
      window.location.reload();
    } catch { setMessage("최신 저장본을 열 수 없습니다. 삭제된 ID는 다시 생성하지 않습니다. JSON 백업 또는 새 악보 저장을 사용해 주세요."); }
  }

  const addPitch = useCallback(
    (pitch: Pitch) => {
      const state = scoreStore.getState();
      if (!state) return;

      const input = {
        pitch,
        durationTicks,
        id: crypto.randomUUID(),
      };
      const tick = cursorRef.current;
      const plan = tick === null ? planAppendNote(state.current, input)
        : planNoteAt(state.current, { ...input, startTick: tick });
      if (!plan.ok) {
        setMessage(plan.message);
        return;
      }

      const result = scoreStore.dispatch(plan.command);
      setMessage(result && !result.ok ? result.error.message : "");
      if (result?.ok && tick !== null) moveCursor(tick + durationTicks);
    },
    [durationTicks, moveCursor],
  );

  if (!session) {
    return (
      <main style={page}>
        <p>준비 중…</p>
      </main>
    );
  }

  const score = session.current;
  const storageBlocked = saveStatus === "conflict" || saveStatus === "deleted";
  const part = score.parts[0];
  const events = part.measures.flatMap((measure) => measure.events);
  const notes = events.filter((event) => event.kind === "note");
  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const selectedNote = selectedEvent?.kind === "note" ? selectedEvent : undefined;
  const ticksPerMeasure = measureTicks(part.timeSignature);
  const ticksPerBeat = TICKS_PER_QUARTER * 4 / part.timeSignature.denominator;
  const tiedIds = new Set(part.ties.flatMap((tie) => [tie.from, tie.to]));
  const rangeSelection = rangeState?.score === score ? rangeState.selection : null;
  const rangeIds = new Set(rangeSelection?.eventIds);

  function runCommand(command: EditCommand): boolean {
    const result = scoreStore.dispatch(command);
    if (result && !result.ok) {
      setMessage(result.error.message);
      return false;
    }
    setMessage("");
    return true;
  }

  /** Same single-dispatch path as runCommand; the clipboard panel shows the error next to its buttons. */
  function clipboardCommand(command: EditCommand): string | null {
    const result = scoreStore.dispatch(command);
    if (result && !result.ok) return result.error.message;
    setMessage("");
    return null;
  }

  function shiftPitch(delta: number) {
    if (!selectedNote) return;
    const nextMidi = selectedNote.pitch.midi + delta;
    if (nextMidi < 0 || nextMidi > 127) {
      setMessage("음역을 벗어났습니다.");
      return;
    }
    runCommand({
      type: "UpdateNote",
      partId: part.id,
      noteId: selectedNote.id,
      patch: { pitch: midiToPitch(nextMidi) },
    });
  }

  function changeDuration(ticks: number) {
    if (!selectedEvent) return;
    runCommand(selectedEvent.kind === "rest" ? {
      type: "UpdateRest", partId: part.id, restId: selectedEvent.id,
      patch: { durationTicks: ticks },
    } : {
      type: "ResizeNote",
      partId: part.id,
      noteId: selectedEvent.id,
      durationTicks: ticks,
    });
  }

  function deleteSelected() {
    if (!selectedEvent) return;
    const ok = runCommand({
      type: "DeleteEvent",
      partId: part.id,
      eventId: selectedEvent.id,
    });
    if (ok) setSelectedEventId(null);
  }

  function insertRest() {
    const plan = planAppendRest(score, { id: crypto.randomUUID(), durationTicks });
    if (!plan.ok) { setMessage(plan.message); return; }
    if (runCommand(plan.command) && plan.command.type === "InsertRest") {
      setSelectedEventId(plan.command.rest.id);
    }
  }

  // Keep the existing note-list identification when extra staff labels are hidden.
  const labelOf = (pitch: Pitch): string => formatNoteLabel(pitch, labelMode) ?? letterName(pitch);

  function chooseMode(next: EditorMode, focus = false) {
    setMode(next);
    if (focus) modeTabs.current[EDITOR_MODES.findIndex((candidate) => candidate.id === next)]?.focus();
  }

  const saveText = saveStatus === "saving" ? "저장 중…" : saveStatus === "saved" ? "저장됨"
    : saveStatus === "conflict" ? "저장 충돌" : saveStatus === "deleted" ? "삭제됨 · 저장 중단" : saveStatus === "error" ? "저장 실패" : "";

  return (
    <main className="editor-main" data-mode={mode}>
      <style>{EDITOR_CSS}</style>
      <header className="editor-header">
        <Link href="/" onNavigate={(event) => { event.preventDefault(); void leaveEditor("/"); }} style={{ fontSize: 14, color: "var(--hb-accent)" }}>
          ← 홈
        </Link>
        {renaming ? (
          <form style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, flex: "1 1 260px", minWidth: 0 }}
            onSubmit={(event) => {
              event.preventDefault();
              const title = String(new FormData(event.currentTarget).get("title") ?? "");
              if (title.trim() !== score.title && !runCommand({ type: "RenameScore", title, updatedAt: new Date().toISOString() })) return;
              setRenaming(false);
            }}>
            <input id="score-title" name="title" aria-label="악보 제목" required autoFocus
              key={`${score.id}:${score.title}`} defaultValue={score.title}
              style={{ minWidth: 0, flex: "1 1 160px", minHeight: 40, padding: "6px 10px", fontSize: 16 }} />
            <button type="submit" style={button}>제목 변경</button>
            <button type="button" style={button} onClick={() => setRenaming(false)}>취소</button>
          </form>
        ) : (
          <>
            <h1>{score.title}</h1>
            <button type="button" style={button} onClick={() => setRenaming(true)}>이름 바꾸기</button>
          </>
        )}
        <div className="editor-header-actions">
          <span aria-live="polite" style={{ fontSize: 13, color: saveStatus === "error" || storageBlocked ? "var(--hb-danger)" : "var(--hb-muted)" }}>
            {saveText}
          </span>
          <button type="button" style={button} onClick={() => scoreStore.undo()}>Undo</button>
          <button type="button" style={button} onClick={() => scoreStore.redo()}>Redo</button>
          <SaveButton autosave={autosave} status={saveStatus} />
        </div>
        {memoryOnly && <section data-testid="storage-unavailable" aria-label="저장되지 않음" style={{ ...panel, width: "100%", borderColor: "#e0a100", marginBottom: 0 }}>
          <p role="alert" style={{ margin: "0 0 8px" }}>
            이 브라우저에서는 저장소(IndexedDB)를 쓸 수 없어 <strong>편집 내용이 저장되지 않습니다.</strong> 사생활 보호 모드이거나 사이트 데이터 저장이 막혀 있을 수 있습니다.
            창을 닫기 전에 JSON 백업을 받아 두세요.
          </p>
          <button type="button" style={button} onClick={() => downloadScoreJson(exportScoreBackup(score))}>현재 내용 JSON 백업</button>
        </section>}
        {storageBlocked && <section data-testid="storage-conflict" aria-label="저장 충돌" style={{ ...panel, width: "100%", marginBottom: 0 }}>
          <p role="alert">{saveStatus === "deleted" ? "다른 탭에서 삭제된 악보입니다." : "다른 탭에서 악보가 변경되었습니다."} 자동·수동 저장을 중단했습니다. 현재 편집과 Undo 이력은 유지됩니다.</p>
          <button type="button" style={button} onClick={() => downloadScoreJson(exportScoreBackup(score))}>현재 내용 JSON 백업</button>{" "}
          <button type="button" style={button} onClick={() => void saveAsNew()}>새 악보 ID로 저장</button>{" "}
          <button type="button" style={button} onClick={() => void openLatest()}>최신 저장본 열기</button>
        </section>}
      </header>

      {/* Original playback highlights must never target the read-only previews inside the mode panels. */}
      <div ref={rootRef} data-testid="editor-content" className="editor-content">
        <section aria-label="악보" style={{ ...panel, marginBottom: 0 }}>
          <div className="editor-staff-bar">
            <NoteLabelsControl mode={labelMode} onChange={setLabelMode} />
            <span data-testid="score-summary" style={{ fontSize: 13, color: "var(--hb-muted)", fontVariantNumeric: "tabular-nums" }}>
              {score.tempoBpm} BPM · {part.timeSignature.numerator}/
              {part.timeSignature.denominator} · 음표 {notes.length}개 · 마디{" "}
              {part.measures.length}개 · 쉼표 {events.length - notes.length}개
            </span>
          </div>
          <div className="editor-staff-view">
            {/* Tapping a glyph opens its editor in the "다듬기" mode. */}
            <StaffView score={score} cursorTick={cursorTick} labelMode={labelMode}
              onSelectEvent={(id) => { setSelectedEventId(id); setMode("edit"); }}
              rangeEventIds={rangeSelection?.eventIds} />
          </div>
          {notes.length === 0 ? <p className="hb-muted" style={{ margin: "8px 0 0" }}>
            아직 음이 없습니다. 입력 모드에서 건반을 누르거나 허밍을 녹음해 보세요.</p> : null}
        </section>

        <div role="tablist" aria-label="작업 모드" className="editor-modes"
          onKeyDown={(event) => {
            const index = EDITOR_MODES.findIndex((candidate) => candidate.id === mode);
            const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1
              : event.key === "Home" ? 0 : event.key === "End" ? EDITOR_MODES.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            chooseMode(EDITOR_MODES[(next + EDITOR_MODES.length) % EDITOR_MODES.length].id, true);
          }}>
          {EDITOR_MODES.map((candidate, index) => (
            <button key={candidate.id} ref={(element) => { modeTabs.current[index] = element; }} type="button" role="tab"
              id={`mode-tab-${candidate.id}`}
              aria-controls={candidate.id === "input" || candidate.id === "edit" ? `mode-panel-${candidate.id} mode-panel-${candidate.id}-more` : `mode-panel-${candidate.id}`} aria-selected={mode === candidate.id}
              tabIndex={mode === candidate.id ? 0 : -1} onClick={() => chooseMode(candidate.id)}>{candidate.label}</button>
          ))}
        </div>

        {message ? (
          <p role="status" className="editor-message" style={{ color: "var(--hb-danger)", fontSize: 13 }}>{message}</p>
        ) : null}

        <div role="tabpanel" id="mode-panel-input" aria-labelledby="mode-tab-input" hidden={mode !== "input"}>
          <div style={{ ...panel, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {DURATIONS.map((duration) => (
              <button key={duration.ticks} type="button"
                style={durationTicks === duration.ticks ? buttonActive : button} onClick={() => setDurationTicks(duration.ticks)}>
                {duration.label}
              </button>
            ))}
            <button type="button" style={button} onClick={insertRest}>쉼표 삽입</button>
            <button type="button" style={button}
              onClick={() => runCommand({ type: "AddMeasure", partId: part.id, measureId: crypto.randomUUID() })}>마디 추가</button>
            <span style={{ fontSize: 12, color: "var(--hb-muted)" }}>{cursorTick === null
              ? "선택한 길이로 악보 끝에 삽입" : "음표: 편집 커서에 삽입 · 쉼표: 악보 끝에 삽입"}</span>
            <div style={{ width: "100%" }}><EditCursor part={part} tick={cursorTick} onChange={moveCursor} /></div>
          </div>
          <div id="piano-input" style={panel}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--hb-muted)" }}>
              건반을 클릭하거나 컴퓨터 키보드 A W S E D F T G Y H U J 로 입력하세요.
            </p>
            <PianoKeyboard onPitch={addPitch} />
          </div>
        </div>

        <div role="tabpanel" id="mode-panel-edit" aria-labelledby="mode-tab-edit" hidden={mode !== "edit"}>
          {selectedEvent ? (
            <div style={panel}>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--hb-muted)" }}>
                {selectedEvent.kind === "rest" ? "선택한 쉼표 편집" : "선택한 음표 편집"}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {selectedNote ? `${letterName(selectedNote.pitch)} · ${koreanFixedDo(selectedNote.pitch)}` : "쉼표"}
                  {" · "}{selectedEvent.durationTicks} ticks
                </span>
                {tiedIds.has(selectedEvent.id) ? (
                  <span style={{ fontSize: 12, color: "var(--hb-muted)" }}>
                    ⌒ 붙임줄 연결됨 (음높이는 연결된 음 전체에 적용)
                  </span>
                ) : null}
                {selectedNote ? <>
                  <button type="button" aria-label="반음 올리기" style={button} onClick={() => shiftPitch(1)}>반음 ↑</button>
                  <button type="button" aria-label="반음 내리기" style={button} onClick={() => shiftPitch(-1)}>반음 ↓</button>
                </> : null}
                {DURATIONS.map((duration) => (
                  <button key={duration.ticks} type="button"
                    aria-label={`선택 ${selectedEvent.kind === "rest" ? "쉼표" : "음표"} 길이 ${duration.label}`}
                    style={selectedEvent.durationTicks === duration.ticks ? buttonActive : button}
                    onClick={() => changeDuration(duration.ticks)}>
                    {duration.label}
                  </button>
                ))}
                <button type="button" aria-label={`선택 ${selectedEvent.kind === "rest" ? "쉼표" : "음표"} 삭제`}
                  style={button} onClick={deleteSelected}>삭제</button>
              </div>
              {selectedEvent.kind === "rest" ? (
                <form key={`${selectedEvent.id}:${selectedEvent.startTick}`} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const measure = Number(data.get("measure"));
                    const beat = Number(data.get("beat"));
                    if (!Number.isInteger(measure) || measure < 1 || measure > part.measures.length ||
                        !Number.isFinite(beat) || beat < 1 || beat >= part.timeSignature.numerator + 1) {
                      setMessage("유효한 마디와 마디 안 박 위치를 입력해 주세요."); return;
                    }
                    runCommand({ type: "UpdateRest", partId: part.id, restId: selectedEvent.id,
                      patch: { startTick: (measure - 1) * ticksPerMeasure + (beat - 1) * ticksPerBeat } });
                  }}>
                  <label>시작 마디 <input name="measure" type="number" required min={1} max={part.measures.length}
                    defaultValue={Math.floor(selectedEvent.startTick / ticksPerMeasure) + 1} style={{ width: 64 }} /></label>
                  <label>마디 안 박 위치 <input name="beat" type="number" required min={1} step="any"
                    defaultValue={(selectedEvent.startTick % ticksPerMeasure) / ticksPerBeat + 1} style={{ width: 72 }} /></label>
                  <button type="submit" style={button}>쉼표 위치 변경</button>
                  <p style={{ width: "100%", margin: 0, fontSize: 12, color: "var(--hb-muted)" }}>
                    박 위치는 1부터 셉니다. 다른 음표·쉼표는 이동하지 않으며 겹침·마디 경계 초과는 적용하지 않습니다.
                  </p>
                </form>
              ) : null}
            </div>
          ) : null}
          <div style={panel}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--hb-muted)" }}>
              음표·쉼표 목록 (선택해서 편집)
            </p>
            {events.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--hb-muted)" }}>아직 음표·쉼표가 없습니다.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {events.map((event) => {
                  const selected = event.id === selectedEventId;
                  return (
                    <li key={event.id}>
                      <button type="button" data-event-id={event.id} aria-pressed={selected}
                        data-range-selected={rangeIds.has(event.id) ? "true" : undefined}
                        onClick={() => setSelectedEventId(selected ? null : event.id)}
                        style={{ ...button, padding: "6px 10px", background: selected ? "#1b2a4a" : "#ffffff",
                          color: selected ? "#ffffff" : "#1c1f26", border: `1px solid ${selected ? "#1b2a4a" : "#c8cfdb"}` }}>
                        {event.kind === "rest" ? "쉼표" : labelOf(event.pitch) || "음표"}
                        {tiedIds.has(event.id) ? " ⌒" : ""}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div style={panel}>
            <RangeSelect score={score} selection={rangeSelection}
              onChange={(selection) => setRangeState(selection ? { score, selection } : null)} />
            <ClipboardControls score={score} selection={rangeSelection} cursorTick={cursorTick} clipboard={clipboard}
              onCopy={setClipboard} onCommand={clipboardCommand} onPasted={moveCursor} />
          </div>
        </div>

      </div>

      {/* Same split as before Phase 7: tools with previews or their own pressed controls stay outside editor-content,
          so playback highlights never reach a preview. */}
      <div role="tabpanel" id="mode-panel-input-more" aria-labelledby="mode-tab-input" hidden={mode !== "input"}>
        <RecordingPanel score={score} cursorTick={cursorTick} labelMode={labelMode} onCommand={clipboardCommand}
          onStart={() => setPlaybackStopSignal((value) => value + 1)} openSignal={start === "hum" ? 1 : 0} />
      </div>
      <div role="tabpanel" id="mode-panel-edit-more" aria-labelledby="mode-tab-edit" hidden={mode !== "edit"}>
        <TransposeTool labelMode={labelMode} autosave={autosave} status={saveStatus} onOpen={() => setPlaybackStopSignal((value) => value + 1)} />
        <ScoreSettings score={score} onCommand={runCommand} />
      </div>
      <div role="tabpanel" id="mode-panel-play" aria-labelledby="mode-tab-play" hidden={mode !== "play"}>
        <PlaybackControls score={score} onPosition={showPosition} stopSignal={playbackStopSignal} cursorTick={cursorTick} />
      </div>

      <div role="tabpanel" id="mode-panel-file" aria-labelledby="mode-tab-file" hidden={mode !== "file"}>
        <div style={panel}>
          <ExportControls score={score} labelMode={labelMode} storageBlocked={storageBlocked || memoryOnly}
            flush={async () => (await autosave.current?.flush()) ?? false} />
        </div>
        <div style={{ ...panel, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <button type="button" style={button} onClick={() => {
            try {
              downloadScoreJson(exportScoreBackup(score));
              setMessage("JSON 백업을 다운로드했습니다.");
            } catch {
              setMessage("JSON 백업을 만들지 못했습니다.");
            }
          }}>JSON 백업</button>
          <Link href="/library" onNavigate={(event) => { event.preventDefault(); void leaveEditor("/library"); }} style={{ fontSize: 14 }}>악보함 / JSON 가져오기</Link>
        </div>
      </div>
    </main>
  );
}
