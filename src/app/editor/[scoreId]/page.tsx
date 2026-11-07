"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Pitch } from "@/domain/score/types";
import { koreanFixedDo, letterName } from "@/domain/music-theory";
import { openOrCreateScore, planAppendNote } from "@/application";
import { getScoreRepository } from "@/adapters/indexeddb";
import { scoreStore } from "@/store/score-store";
import { useScoreState } from "@/store/useScoreStore";
import { StaffView } from "@/features/score-editor";
import { midiToPitch, PianoKeyboard } from "@/features/piano-input";
import { useAutosave } from "@/features/score-library";
import { playScore, type PlaybackHandle } from "@/adapters/tone/playback";
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
  const scoreId = params?.scoreId ?? "demo-score";
  const session = useScoreState();
  const [durationTicks, setDurationTicks] = useState(960);
  const [labelMode, setLabelMode] = useState<LabelMode>("letter");
  const [message, setMessage] = useState("");
  const [playing, setPlaying] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const repository = getScoreRepository();
  const saveStatus = useAutosave(repository);

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

  useEffect(
    () => () => {
      playbackRef.current?.stop();
    },
    [],
  );

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
  const selectedNote = selectedNoteId
    ? notes.find((note) => note.id === selectedNoteId)
    : undefined;
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
    if (!selectedNote) return;
    runCommand({
      type: "ResizeNote",
      partId: part.id,
      noteId: selectedNote.id,
      durationTicks: ticks,
    });
  }

  function deleteSelected() {
    if (!selectedNote) return;
    const ok = runCommand({
      type: "DeleteEvent",
      partId: part.id,
      eventId: selectedNote.id,
    });
    if (ok) setSelectedNoteId(null);
  }

  const labelOf = (pitch: Pitch): string => {
    if (labelMode === "letter") return letterName(pitch);
    if (labelMode === "korean") return koreanFixedDo(pitch);
    return "";
  };

  async function togglePlay() {
    if (playbackRef.current || playing) {
      playbackRef.current?.stop();
      playbackRef.current = null;
      setPlaying(false);
      return;
    }
    if (notes.length === 0) {
      setMessage("재생할 음표가 없습니다.");
      return;
    }
    setPlaying(true);
    try {
      playbackRef.current = await playScore(score, {
        onEnd: () => {
          playbackRef.current = null;
          setPlaying(false);
        },
      });
    } catch {
      setPlaying(false);
      setMessage("재생을 시작하지 못했습니다.");
    }
  }

  return (
    <main style={page}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href="/" style={{ fontSize: 13, color: "#1b2a4a" }}>
          ← 홈
        </Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>{score.title}</h1>
        <span style={{ fontSize: 12, color: "#5f6773" }}>
          {score.tempoBpm} BPM · {part.timeSignature.numerator}/
          {part.timeSignature.denominator} · 음표 {notes.length}개 · 마디{" "}
          {part.measures.length}개
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
        <button type="button" style={button} onClick={togglePlay}>
          {playing ? "Stop" : "Play"}
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
        <p style={{ color: "#b91c1c", fontSize: 13 }}>{message}</p>
      ) : null}

      <div style={panel}>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#5f6773" }}>
          음표 목록 (선택해서 편집)
        </p>
        {notes.length === 0 ? (
          <p style={{ fontSize: 13, color: "#5f6773" }}>아직 음표가 없습니다.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {notes.map((note) => {
              const selected = note.id === selectedNoteId;
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedNoteId(selected ? null : note.id)}
                    style={{
                      ...button,
                      padding: "6px 10px",
                      background: selected ? "#1b2a4a" : "#ffffff",
                      color: selected ? "#ffffff" : "#1c1f26",
                      border: `1px solid ${selected ? "#1b2a4a" : "#c8cfdb"}`,
                    }}
                  >
                    {labelOf(note.pitch) || "음표"}
                    {tiedIds.has(note.id) ? " ⌒" : ""}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedNote ? (
        <div style={panel}>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#5f6773" }}>
            선택한 음표 편집
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {letterName(selectedNote.pitch)} ·{" "}
              {koreanFixedDo(selectedNote.pitch)} · {selectedNote.durationTicks} ticks
            </span>
            {tiedIds.has(selectedNote.id) ? (
              <span style={{ fontSize: 12, color: "#5f6773" }}>
                ⌒ 붙임줄 연결됨 (음높이는 연결된 음 전체에 적용)
              </span>
            ) : null}
            <button
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
            </button>
            {DURATIONS.map((duration) => (
              <button
                key={duration.ticks}
                type="button"
                aria-label={`선택 음표 길이 ${duration.label}`}
                style={
                  selectedNote.durationTicks === duration.ticks
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
              aria-label="선택 음표 삭제"
              style={button}
              onClick={deleteSelected}
            >
              삭제
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
