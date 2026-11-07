"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Pitch } from "@/domain/score/types";
import { koreanFixedDo, letterName } from "@/domain/music-theory";
import { exportScoreBackup, openOrCreateScore, planAppendNote, planAppendRest } from "@/application";
import { measureTicks, TICKS_PER_QUARTER } from "@/domain/score";
import { downloadScoreJson } from "@/adapters/file-export/json";
import { getScoreRepository } from "@/adapters/indexeddb";
import { scoreStore } from "@/store/score-store";
import { useScoreState } from "@/store/useScoreStore";
import { ScoreSettings, StaffView } from "@/features/score-editor";
import { midiToPitch, PianoKeyboard } from "@/features/piano-input";
import { useAutosave, type AutosaveHandle } from "@/features/score-library";
import { PlaybackControls, highlightPlayback } from "@/features/playback";
import type { PlaybackPosition } from "@/domain/score";
import type { EditCommand } from "@/domain/commands";

type LabelMode = "off" | "letter" | "korean";

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

const panel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d9dee8",
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
};

export default function EditorPage() {
  const params = useParams<{ scoreId: string }>();
  const router = useRouter();
  const scoreId = params?.scoreId ?? "demo-score";
  const session = useScoreState();
  const [durationTicks, setDurationTicks] = useState(960);
  const [labelMode, setLabelMode] = useState<LabelMode>("letter");
  const [message, setMessage] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const rootRef = useRef<HTMLElement>(null);
  const showPosition = useCallback((position: PlaybackPosition) => {
    if (rootRef.current) highlightPlayback(rootRef.current, position.activeNoteIds);
  }, []);
  const repository = getScoreRepository();
  const autosave = useRef<AutosaveHandle | null>(null);
  const navigationPending = useRef(false);
  const saveStatus = useAutosave(repository, 400, autosave);

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

  useEffect(() => {
    let active = true;
    const existing = scoreStore.getState();
    if (existing?.current.id === scoreId) return;

    openOrCreateScore(repository, {
      id: scoreId,
      createdAt: new Date().toISOString(),
    })
      .then((result) => {
        if (active) scoreStore.init(result.score);
      })
      .catch(() => {
        if (active) setLoadError("악보를 불러오지 못했습니다.");
      });

    return () => {
      active = false;
    };
  }, [repository, scoreId]);

  const addPitch = useCallback(
    (pitch: Pitch) => {
      const state = scoreStore.getState();
      if (!state) return;

      const plan = planAppendNote(state.current, {
        pitch,
        durationTicks,
        id: crypto.randomUUID(),
      });
      if (!plan.ok) {
        setMessage(plan.message);
        return;
      }

      const result = scoreStore.dispatch(plan.command);
      setMessage(result && !result.ok ? result.error.message : "");
    },
    [durationTicks],
  );

  if (!session) {
    return (
      <main style={page}>
        <p>준비 중…</p>
      </main>
    );
  }

  const score = session.current;
  const part = score.parts[0];
  const events = part.measures.flatMap((measure) => measure.events);
  const notes = events.filter((event) => event.kind === "note");
  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const selectedNote = selectedEvent?.kind === "note" ? selectedEvent : undefined;
  const ticksPerMeasure = measureTicks(part.timeSignature);
  const ticksPerBeat = TICKS_PER_QUARTER * 4 / part.timeSignature.denominator;
  const tiedIds = new Set(part.ties.flatMap((tie) => [tie.from, tie.to]));

  function runCommand(command: EditCommand): boolean {
    const result = scoreStore.dispatch(command);
    if (result && !result.ok) {
      setMessage(result.error.message);
      return false;
    }
    setMessage("");
    return true;
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

  const labelOf = (pitch: Pitch): string => {
    if (labelMode === "letter") return letterName(pitch);
    if (labelMode === "korean") return koreanFixedDo(pitch);
    return "";
  };

  return (
    <main ref={rootRef} style={page}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href="/" onNavigate={(event) => { event.preventDefault(); void leaveEditor("/"); }} style={{ fontSize: 13, color: "#1b2a4a" }}>
          ← 홈
        </Link>
        <h1 style={{ fontSize: 20, margin: 0, overflowWrap: "anywhere", maxWidth: "100%" }}>{score.title}</h1>
        <span style={{ fontSize: 12, color: "#5f6773" }}>
          {score.tempoBpm} BPM · {part.timeSignature.numerator}/
          {part.timeSignature.denominator} · 음표 {notes.length}개 · 마디{" "}
          {part.measures.length}개 · 쉼표 {events.length - notes.length}개
        </span>
        <span
          style={{
            fontSize: 12,
            color: saveStatus === "error" ? "#b91c1c" : "#5f6773",
          }}
        >
          {saveStatus === "saving"
            ? "저장 중…"
            : saveStatus === "saved"
              ? "저장됨"
              : saveStatus === "error"
                ? "저장 실패"
                : ""}
        </span>
      </div>

      <form
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

      <ScoreSettings score={score} onCommand={runCommand} />
      <PlaybackControls score={score} onPosition={showPosition} />

      {loadError ? (
        <p style={{ color: "#b91c1c", fontSize: 13 }}>{loadError}</p>
      ) : null}

      <div style={{ ...panel, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={button} onClick={() => scoreStore.undo()}>
          Undo
        </button>
        <button type="button" style={button} onClick={() => scoreStore.redo()}>
          Redo
        </button>
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
        <span style={{ fontSize: 12, color: "#5f6773" }}>선택한 길이로 악보 끝에 삽입</span>
        <span style={{ width: 1, background: "#d9dee8", margin: "0 4px" }} />
        {(["off", "letter", "korean"] as LabelMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            style={labelMode === mode ? buttonActive : button}
            onClick={() => setLabelMode(mode)}
          >
            {mode === "off" ? "라벨 끔" : mode === "letter" ? "C D E" : "도 레 미"}
          </button>
        ))}
      </div>

      <div style={panel}>
        <StaffView score={score} />
      </div>

      <div style={panel}>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#5f6773" }}>
          건반을 클릭하거나 컴퓨터 키보드 A W S E D F T G Y H U J 로 입력하세요.
        </p>
        <PianoKeyboard onPitch={addPitch} />
      </div>

      {message ? (
        <p role="status" style={{ color: "#b91c1c", fontSize: 13 }}>{message}</p>
      ) : null}

      <div style={panel}>
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
        <div style={panel}>
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
    </main>
  );
}
