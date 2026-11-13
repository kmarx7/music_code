"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type EditorTab = "input" | "play" | "edit" | "file";
const EDITOR_TABS: readonly { id: EditorTab; label: string }[] = [
  { id: "input", label: "입력" }, { id: "play", label: "재생·연습" }, { id: "edit", label: "편집" }, { id: "file", label: "파일" },
];
/**
 * Phone layout (P6-03, D-04 #4). Desktop keeps the document order. At ≤ 768px the page becomes one column:
 * header → Undo/Redo → staff → message → tab bar → the active tab's panels. Inactive panels are only hidden,
 * never unmounted, so recording, playback and form state survive a tab switch.
 */
const EDITOR_CSS = `
.editor-tabs { display: none; }
@media (max-width: 768px) {
  .editor-main { display: flex; flex-direction: column; padding: 12px !important; }
  .editor-main > *, .editor-content > * { order: 5; }
  .editor-content { display: contents; }
  .editor-main > .editor-header { order: 0; }
  .editor-content > .editor-toolbar { order: 1; }
  /* The staff panel dissolves: the staff stays on top, its tab tools go under the tab bar with the other panels. */
  .editor-content > .editor-staff { display: contents; }
  .editor-staff > * { order: 5; }
  .editor-staff > .editor-staff-view { order: 2; margin-bottom: 12px; }
  .editor-staff > [data-editor-tab] { background: #ffffff; border: 1px solid #d9dee8; border-radius: 10px; padding: 12px; margin-bottom: 16px; }
  .editor-content > .editor-message { order: 3; }
  .editor-main > .editor-tabs { order: 4; display: flex; gap: 4px; position: sticky; top: 0; z-index: 5;
    margin: 0 -12px 12px; padding: 6px 12px; background: #f6f7fb; border-bottom: 1px solid #d9dee8; }
  .editor-tabs [role="tab"] { flex: 1 1 0; min-height: 44px; border: 1px solid #c8cfdb; border-radius: 8px;
    background: #ffffff; color: #1c1f26; font-size: 14px; }
  .editor-tabs [role="tab"][aria-selected="true"] { background: #1b2a4a; border-color: #1b2a4a; color: #ffffff; font-weight: 600; }
  .editor-main[data-mobile-tab="input"] [data-editor-tab]:not([data-editor-tab="input"]),
  .editor-main[data-mobile-tab="play"] [data-editor-tab]:not([data-editor-tab="play"]),
  .editor-main[data-mobile-tab="edit"] [data-editor-tab]:not([data-editor-tab="edit"]),
  .editor-main[data-mobile-tab="file"] [data-editor-tab]:not([data-editor-tab="file"]) { display: none !important; }
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
  // Phone-only tab (UI state, never stored). Desktop shows every panel.
  const [mobileTab, setMobileTab] = useState<EditorTab>("input");
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

  // Home entry (P6-02): "?start=hum" brings the recording panel into view with its consent box focused,
  // "?start=piano" brings the keyboard into view. Nothing starts recording by itself.
  useEffect(() => {
    const start = new URLSearchParams(window.location.search).get("start");
    if (start === "hum") {
      const panel = document.querySelector<HTMLElement>('[data-testid="recording-panel"]');
      panel?.scrollIntoView({ block: "start" });
      panel?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus({ preventScroll: true });
    } else if (start === "piano") {
      document.getElementById("piano-input")?.scrollIntoView({ block: "center" });
    }
  }, []);

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

  return (
    <main style={page} className="editor-main" data-mobile-tab={mobileTab}>
      <style>{EDITOR_CSS}</style>
      <div className="editor-header" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href="/" onNavigate={(event) => { event.preventDefault(); void leaveEditor("/"); }} style={{ fontSize: 13, color: "#1b2a4a" }}>
          ← 홈
        </Link>
        <h1 style={{ fontSize: 20, margin: 0, overflowWrap: "anywhere", maxWidth: "100%" }}>{score.title}</h1>
        <span data-testid="score-summary" style={{ fontSize: 12, color: "#5f6773" }}>
          {score.tempoBpm} BPM · {part.timeSignature.numerator}/
          {part.timeSignature.denominator} · 음표 {notes.length}개 · 마디{" "}
          {part.measures.length}개 · 쉼표 {events.length - notes.length}개
        </span>
        <span
          style={{
            fontSize: 12,
            color: saveStatus === "error" || storageBlocked ? "#b91c1c" : "#5f6773",
          }}
        >
          {saveStatus === "saving"
            ? "저장 중…"
            : saveStatus === "saved"
              ? "저장됨"
              : saveStatus === "conflict" ? "저장 충돌"
              : saveStatus === "deleted" ? "삭제됨 · 저장 중단"
              : saveStatus === "error"
                ? "저장 실패"
                : ""}
        </span>
        <SaveButton autosave={autosave} status={saveStatus} />
        {memoryOnly && <section data-testid="storage-unavailable" aria-label="저장되지 않음" style={{ ...panel, width: "100%", borderColor: "#e0a100", marginBottom: 0 }}>
          <p role="alert" style={{ margin: "0 0 8px" }}>
            이 브라우저에서는 저장소(IndexedDB)를 쓸 수 없어 <strong>편집 내용이 저장되지 않습니다.</strong> 사생활 보호 모드이거나 사이트 데이터 저장이 막혀 있을 수 있습니다.
            창을 닫기 전에 JSON 백업을 받아 두세요.
          </p>
          <button type="button" style={button} onClick={() => downloadScoreJson(exportScoreBackup(score))}>현재 내용 JSON 백업</button>
        </section>}
        {storageBlocked && <section data-testid="storage-conflict" aria-label="저장 충돌" style={panel}>
          <p role="alert">{saveStatus === "deleted" ? "다른 탭에서 삭제된 악보입니다." : "다른 탭에서 악보가 변경되었습니다."} 자동·수동 저장을 중단했습니다. 현재 편집과 Undo 이력은 유지됩니다.</p>
          <button type="button" style={button} onClick={() => downloadScoreJson(exportScoreBackup(score))}>현재 내용 JSON 백업</button>{" "}
          <button type="button" style={button} onClick={() => void saveAsNew()}>새 악보 ID로 저장</button>{" "}
          <button type="button" style={button} onClick={() => void openLatest()}>최신 저장본 열기</button>
        </section>}

      </div>

      <div role="tablist" aria-label="편집기 영역" className="editor-tabs">
        {EDITOR_TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={mobileTab === tab.id}
            onClick={() => setMobileTab(tab.id)}>{tab.label}</button>
        ))}
      </div>

      <form data-editor-tab="file"
        style={{ ...panel, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}
        onSubmit={(event) => {
          event.preventDefault();
          const title = String(new FormData(event.currentTarget).get("title") ?? "");
          if (title.trim() === score.title) return;
          runCommand({ type: "RenameScore", title, updatedAt: new Date().toISOString() });
        }}
      >
        <label htmlFor="score-title">악보 제목</label>
        <input id="score-title" name="title" aria-label="악보 제목" required
          key={`${score.id}:${score.title}`} defaultValue={score.title}
          style={{ minWidth: 0, maxWidth: "100%", flex: "1 1 160px", padding: 8 }} />
        <button type="submit" style={button}>제목 변경</button>
        <button type="button" style={button} onClick={() => {
          try {
            downloadScoreJson(exportScoreBackup(score));
            setMessage("JSON 백업을 다운로드했습니다.");
          } catch {
            setMessage("JSON 백업을 만들지 못했습니다.");
          }
        }}>JSON 백업</button>
        <Link href="/library" onNavigate={(event) => { event.preventDefault(); void leaveEditor("/library"); }} style={{ fontSize: 13 }}>악보함 / JSON 가져오기</Link>
      </form>

      <div data-editor-tab="file" style={panel}>
        <ExportControls score={score} labelMode={labelMode} storageBlocked={storageBlocked || memoryOnly}
          flush={async () => (await autosave.current?.flush()) ?? false} />
      </div>

      <div data-editor-tab="edit"><ScoreSettings score={score} onCommand={runCommand} /></div>
      <div data-editor-tab="edit"><TransposeTool labelMode={labelMode} autosave={autosave} status={saveStatus} onOpen={() => setPlaybackStopSignal((value) => value + 1)} /></div>
      <div data-editor-tab="play"><PlaybackControls score={score} onPosition={showPosition} stopSignal={playbackStopSignal} cursorTick={cursorTick} /></div>
      <div data-editor-tab="input"><RecordingPanel score={score} cursorTick={cursorTick} labelMode={labelMode} onCommand={clipboardCommand}
        onStart={() => setPlaybackStopSignal((value) => value + 1)} /></div>

      {/* Original playback highlights must never target the read-only preview. */}
      <div ref={rootRef} data-testid="editor-content" className="editor-content">

      <div className="editor-toolbar" style={{ ...panel, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={button} onClick={() => scoreStore.undo()}>
          Undo
        </button>
        <button type="button" style={button} onClick={() => scoreStore.redo()}>
          Redo
        </button>
        <span data-editor-tab="input" style={{ display: "contents" }}>
        <button
          type="button"
          style={button}
          onClick={() =>
            runCommand({
              type: "AddMeasure",
              partId: part.id,
              measureId: crypto.randomUUID(),
            })
          }
        >
          마디 추가
        </button>
        <span style={{ width: 1, background: "#d9dee8", margin: "0 4px" }} />
        {DURATIONS.map((duration) => (
          <button
            key={duration.ticks}
            type="button"
            style={durationTicks === duration.ticks ? buttonActive : button}
            onClick={() => setDurationTicks(duration.ticks)}
          >
            {duration.label}
          </button>
        ))}
        <button type="button" style={button} onClick={insertRest}>
          쉼표 삽입
        </button>
        <span style={{ fontSize: 12, color: "#5f6773" }}>{cursorTick === null
          ? "선택한 길이로 악보 끝에 삽입" : "음표: 편집 커서에 삽입 · 쉼표: 악보 끝에 삽입"}</span>
        </span>
        <span data-editor-tab="edit" style={{ display: "contents" }}>
        <span style={{ width: 1, background: "#d9dee8", margin: "0 4px" }} />
        <NoteLabelsControl mode={labelMode} onChange={setLabelMode} />
        </span>
      </div>

      <div className="editor-staff" style={panel}>
        <div data-editor-tab="input"><EditCursor part={part} tick={cursorTick} onChange={moveCursor} /></div>
        <div data-editor-tab="edit">
          <RangeSelect score={score} selection={rangeSelection}
            onChange={(selection) => setRangeState(selection ? { score, selection } : null)} />
          <ClipboardControls score={score} selection={rangeSelection} cursorTick={cursorTick} clipboard={clipboard}
            onCopy={setClipboard} onCommand={clipboardCommand} onPasted={moveCursor} />
        </div>
        <div className="editor-staff-view">
          {/* Tapping a glyph opens its editor; on a phone that lives in the "편집" tab. */}
          <StaffView score={score} cursorTick={cursorTick} labelMode={labelMode}
            onSelectEvent={(id) => { setSelectedEventId(id); setMobileTab("edit"); }}
            rangeEventIds={rangeSelection?.eventIds} />
        </div>
      </div>

      <div id="piano-input" data-editor-tab="input" style={panel}>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#5f6773" }}>
          건반을 클릭하거나 컴퓨터 키보드 A W S E D F T G Y H U J 로 입력하세요.
        </p>
        <PianoKeyboard onPitch={addPitch} />
      </div>

      {message ? (
        <p role="status" className="editor-message" style={{ color: "#b91c1c", fontSize: 13 }}>{message}</p>
      ) : null}

      <div data-editor-tab="edit" style={panel}>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#5f6773" }}>
          음표·쉼표 목록 (선택해서 편집)
        </p>
        {events.length === 0 ? (
          <p style={{ fontSize: 13, color: "#5f6773" }}>아직 음표·쉼표가 없습니다.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {events.map((event) => {
              const selected = event.id === selectedEventId;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    data-event-id={event.id}
                    aria-pressed={selected}
                    data-range-selected={rangeIds.has(event.id) ? "true" : undefined}
                    onClick={() => setSelectedEventId(selected ? null : event.id)}
                    style={{
                      ...button,
                      padding: "6px 10px",
                      background: selected ? "#1b2a4a" : "#ffffff",
                      color: selected ? "#ffffff" : "#1c1f26",
                      border: `1px solid ${selected ? "#1b2a4a" : "#c8cfdb"}`,
                    }}
                  >
                    {event.kind === "rest" ? "쉼표" : labelOf(event.pitch) || "음표"}
                    {tiedIds.has(event.id) ? " ⌒" : ""}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedEvent ? (
        <div data-editor-tab="edit" style={panel}>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#5f6773" }}>
            {selectedEvent.kind === "rest" ? "선택한 쉼표 편집" : "선택한 음표 편집"}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {selectedNote ? `${letterName(selectedNote.pitch)} · ${koreanFixedDo(selectedNote.pitch)}` : "쉼표"}
              {" · "}{selectedEvent.durationTicks} ticks
            </span>
            {tiedIds.has(selectedEvent.id) ? (
              <span style={{ fontSize: 12, color: "#5f6773" }}>
                ⌒ 붙임줄 연결됨 (음높이는 연결된 음 전체에 적용)
              </span>
            ) : null}
            {selectedNote ? <><button
              type="button"
              aria-label="반음 올리기"
              style={button}
              onClick={() => shiftPitch(1)}
            >
              반음 ↑
            </button>
            <button
              type="button"
              aria-label="반음 내리기"
              style={button}
              onClick={() => shiftPitch(-1)}
            >
              반음 ↓
            </button></> : null}
            {DURATIONS.map((duration) => (
              <button
                key={duration.ticks}
                type="button"
                aria-label={`선택 ${selectedEvent.kind === "rest" ? "쉼표" : "음표"} 길이 ${duration.label}`}
                style={
                  selectedEvent.durationTicks === duration.ticks
                    ? buttonActive
                    : button
                }
                onClick={() => changeDuration(duration.ticks)}
              >
                {duration.label}
              </button>
            ))}
            <button
              type="button"
              aria-label={`선택 ${selectedEvent.kind === "rest" ? "쉼표" : "음표"} 삭제`}
              style={button}
              onClick={deleteSelected}
            >
              삭제
            </button>
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
              <p style={{ width: "100%", margin: 0, fontSize: 12, color: "#5f6773" }}>
                박 위치는 1부터 셉니다. 다른 음표·쉼표는 이동하지 않으며 겹침·마디 경계 초과는 적용하지 않습니다.
              </p>
            </form>
          ) : null}
        </div>
      ) : null}
      </div>
    </main>
  );
}
