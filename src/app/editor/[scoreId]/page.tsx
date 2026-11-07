"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createEmptyScore } from "@/domain/score";
import type { Pitch } from "@/domain/score/types";
import { koreanFixedDo, letterName } from "@/domain/music-theory";
import { planAppendNote } from "@/application";
import { scoreStore } from "@/store/score-store";
import { useScoreState } from "@/store/useScoreStore";
import { StaffView } from "@/features/score-editor";
import { PianoKeyboard } from "@/features/piano-input";
import { playScore, type PlaybackHandle } from "@/adapters/tone/playback";

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
  const playbackRef = useRef<PlaybackHandle | null>(null);

  useEffect(() => {
    if (scoreStore.getState()) return;
    scoreStore.init(
      createEmptyScore({
        id: scoreId,
        title: "새 악보",
        measureCount: 8,
        createdAt: new Date().toISOString(),
      }),
    );
  }, [scoreId]);

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

  const labelOf = (pitch: Pitch): string => {
    if (labelMode === "letter") return letterName(pitch);
    if (labelMode === "korean") return koreanFixedDo(pitch);
    return "";
  };

  async function togglePlay() {
    if (playbackRef.current) {
      playbackRef.current.stop();
      playbackRef.current = null;
      setPlaying(false);
      return;
    }
    if (notes.length === 0) {
      setMessage("재생할 음표가 없습니다.");
      return;
    }
    setPlaying(true);
    const handle = await playScore(score, {
      onEnd: () => {
        playbackRef.current = null;
        setPlaying(false);
      },
    });
    playbackRef.current = handle;
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
          {part.timeSignature.denominator} · 음표 {notes.length}개
        </span>
      </div>

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
          음표 목록
        </p>
        {notes.length === 0 ? (
          <p style={{ fontSize: 13, color: "#5f6773" }}>아직 음표가 없습니다.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {notes.map((note) => (
              <li
                key={note.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid #d9dee8",
                  borderRadius: 8,
                  padding: "4px 8px",
                  fontSize: 13,
                }}
              >
                <span>{labelOf(note.pitch) || "음표"}</span>
                <button
                  type="button"
                  aria-label="음표 삭제"
                  style={{ ...button, padding: "2px 6px" }}
                  onClick={() =>
                    scoreStore.dispatch({
                      type: "DeleteEvent",
                      partId: part.id,
                      eventId: note.id,
                    })
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
