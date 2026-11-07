"use client";

import { useEffect, useRef, useState } from "react";
import { playbackEndTick } from "@/domain/score";
import type { PlaybackPosition, Score } from "@/domain/score";
import { playScore, type PlaybackHandle, type PlaybackState } from "@/adapters/tone/playback";

const button = { padding: "6px 12px", borderRadius: 8, border: "1px solid #c8cfdb", background: "#fff", cursor: "pointer" };

/** High-frequency transport state is local, outside the editor/Score store. */
export function PlaybackControls({ score, onPosition }: {
  score: Score;
  onPosition: (position: PlaybackPosition) => void;
}) {
  const [state, setState] = useState<PlaybackState>("stopped");
  const [position, setPosition] = useState<PlaybackPosition | null>(null);
  const [metronome, setMetronome] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const handle = useRef<PlaybackHandle | null>(null);
  const request = useRef(0);
  const metronomeRef = useRef(false);

  useEffect(() => {
    return () => {
      // Score edits (including undo/settings) invalidate both active and pending audio.
      handle.current?.stop(); handle.current = null;
      request.current += 1;
      setState("stopped"); setPosition(null); setReady(false);
      onPosition({ tick: 0, measure: 1, beat: 1, activeNoteIds: [] });
    };
  }, [score, onPosition]);

  function stop() {
    handle.current?.stop(); handle.current = null;
    request.current += 1;
    setState("stopped"); setPosition(null); setReady(false);
    onPosition({ tick: 0, measure: 1, beat: 1, activeNoteIds: [] });
  }
  async function play() {
    if (!metronomeRef.current && !score.parts[0].measures.some((measure) => measure.events.length)) {
      setError("빈 악보는 메트로놈을 켜고 재생해 주세요."); return;
    }
    setError(""); setReady(false); setState("playing");
    const token = ++request.current;
    try {
      const next = await playScore(score, {
        metronome: metronomeRef.current,
        onState: (value) => { if (token === request.current) setState(value); },
        onPosition: (value) => {
          if (token !== request.current) return;
          setPosition(value); onPosition(value);
        },
        onEnd: () => { if (token === request.current) { handle.current = null; setReady(false); } },
      });
      if (token !== request.current) next.stop();
      else { handle.current = next; setReady(true); next.setMetronome(metronomeRef.current); }
    } catch {
      if (token !== request.current) return;
      stop(); setError("재생을 시작하지 못했습니다. 브라우저 오디오 권한을 확인해 주세요.");
    }
  }
  return (
    <div role="group" aria-label="재생 제어" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <button type="button" style={button} onClick={state === "stopped" ? play : stop}>{state === "stopped" ? "Play" : "Stop"}</button>
      <button type="button" style={button} disabled={state === "stopped" || !ready} onClick={() => {
        try {
          if (state === "paused") handle.current?.resume(); else handle.current?.pause();
        } catch { stop(); setError("재생을 계속하지 못했습니다. 다시 Play를 눌러 주세요."); }
      }}>{state === "paused" ? "Resume" : "Pause"}</button>
      <label><input type="checkbox" checked={metronome} onChange={(event) => {
        const enabled = event.target.checked;
        metronomeRef.current = enabled; setMetronome(enabled); handle.current?.setMetronome(enabled);
      }} /> 메트로놈</label>
      <span style={{ fontSize: 12 }}>분모 음가마다 클릭 · 마디 첫 박 강조</span>
      <progress aria-label="악보 재생 위치" max={playbackEndTick(score) || 1} value={position?.tick ?? 0} style={{ maxWidth: "100%" }} />
      <output data-testid="playback-position" data-tick={Math.floor(position?.tick ?? 0)} style={{ fontSize: 13 }}>
        {state === "stopped" ? "정지" : state === "paused" ? "일시정지" : "재생 중"}
        {" · "}{position?.measure ?? 1}마디 {position?.beat ?? 1}박 · {Math.floor(position?.tick ?? 0)} ticks
      </output>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
