"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PRACTICE_RATE, PRACTICE_RATE_MAX, PRACTICE_RATE_MIN, effectiveTempoBpm, measureRangeLoop,
  playbackEndTick, scoreLengthTicks,
} from "@/domain/score";
import type { PlaybackLoop, PlaybackPosition, Score } from "@/domain/score";
import { playScore, type PlaybackHandle, type PlaybackState } from "@/adapters/tone/playback";

// Practice rate is edited in whole percent so the 5% steps stay exact (PRD MVP-008).
const RATE_MIN_PERCENT = PRACTICE_RATE_MIN * 100;
const RATE_MAX_PERCENT = PRACTICE_RATE_MAX * 100;
const RATE_DEFAULT_PERCENT = DEFAULT_PRACTICE_RATE * 100;
const RATE_STEP_PERCENT = 5;
const RATE_PRESETS = [50, 75, 100, 125] as const;

const sameLoop = (a: PlaybackLoop | null, b: PlaybackLoop | null) =>
  a?.startTick === b?.startTick && a?.endTick === b?.endTick;
const measureInput = { width: 56, padding: "4px 6px", borderRadius: 6, border: "1px solid #c8cfdb" };

const button = { padding: "6px 12px", borderRadius: 8, border: "1px solid #c8cfdb", background: "#fff", cursor: "pointer" };

/** High-frequency transport state is local, outside the editor/Score store. */
export function PlaybackControls({ score, onPosition, stopSignal = 0, cursorTick = null }: {
  score: Score;
  onPosition: (position: PlaybackPosition) => void;
  stopSignal?: number;
  /** Edit cursor (absolute tick) for "play from cursor" (MVP-012); null when there is no cursor. */
  cursorTick?: number | null;
}) {
  const [state, setState] = useState<PlaybackState>("stopped");
  const [position, setPosition] = useState<PlaybackPosition | null>(null);
  const [metronome, setMetronome] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const handle = useRef<PlaybackHandle | null>(null);
  const request = useRef(0);
  const metronomeRef = useRef(false);
  // Session-only practice state: never dispatched, stored or added to undo history (ADR-004).
  const [ratePercent, setRatePercent] = useState(RATE_DEFAULT_PERCENT);
  const rateRef = useRef(RATE_DEFAULT_PERCENT);
  // A–B loop is chosen by 1-based measure numbers and re-derived from the current Score on every render,
  // so an edit or undo can never leave a stale tick range behind.
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopFirst, setLoopFirst] = useState(1);
  const [loopLast, setLoopLast] = useState(1);
  const loopRef = useRef<PlaybackLoop | null>(null);
  const measureCount = score.parts[0]?.measures.length ?? 0;
  const loopRange = measureRangeLoop(score, loopFirst, loopLast);
  const activeLoop = loopEnabled ? loopRange : null;

  useEffect(() => {
    const reset = () => {
      handle.current?.stop(); handle.current = null;
      request.current += 1;
      setState("stopped"); setPosition(null); setReady(false);
      onPosition({ tick: 0, measure: 1, beat: 1, activeNoteIds: [] });
    };
    // An endless loop must not keep sounding in a tab the user has left.
    const onVisibility = () => { if (document.hidden && loopRef.current && handle.current) reset(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      // Score edits (including undo/settings) invalidate both active and pending audio.
      reset();
    };
  }, [score, onPosition, stopSignal]);

  function stop() {
    handle.current?.stop(); handle.current = null;
    request.current += 1;
    setState("stopped"); setPosition(null); setReady(false);
    onPosition({ tick: 0, measure: 1, beat: 1, activeNoteIds: [] });
  }
  function changeRate(requested: number) {
    if (!Number.isFinite(requested)) return;
    const stepped = Math.round(requested / RATE_STEP_PERCENT) * RATE_STEP_PERCENT;
    const next = Math.min(RATE_MAX_PERCENT, Math.max(RATE_MIN_PERCENT, stepped));
    if (next === rateRef.current) return;
    rateRef.current = next; setRatePercent(next);
    try { handle.current?.setRate(next / 100); }
    catch { stop(); setError("연습 속도를 적용하지 못했습니다. 다시 Play를 눌러 주세요."); }
  }
  function changeLoop(enabled: boolean, first: number, last: number) {
    setLoopEnabled(enabled); setLoopFirst(first); setLoopLast(last);
    const next = enabled ? measureRangeLoop(score, first, last) : null;
    if (sameLoop(next, loopRef.current)) return;
    loopRef.current = next;
    try { handle.current?.setLoop(next); }
    catch { stop(); setError("반복 구간을 적용하지 못했습니다. 다시 Play를 눌러 주세요."); }
  }
  async function play(fromTick = 0) {
    if (!metronomeRef.current && !score.parts[0].measures.some((measure) => measure.events.length)) {
      setError("빈 악보는 메트로놈을 켜고 재생해 주세요."); return;
    }
    if (fromTick > 0 && !activeLoop && !metronomeRef.current && fromTick >= playbackEndTick(score)) {
      setError("커서 뒤에 재생할 음표가 없습니다. 커서를 옮기거나 처음부터 재생해 주세요."); return;
    }
    setError(""); setReady(false); setState("playing");
    const token = ++request.current;
    const requestedRate = rateRef.current;
    const requestedLoop = activeLoop;
    loopRef.current = requestedLoop;
    try {
      const next = await playScore(score, {
        metronome: metronomeRef.current,
        rate: requestedRate / 100,
        loop: requestedLoop,
        fromTick,
        onState: (value) => { if (token === request.current) setState(value); },
        onPosition: (value) => {
          if (token !== request.current) return;
          setPosition(value); onPosition(value);
        },
        onEnd: () => { if (token === request.current) { handle.current = null; setReady(false); } },
      });
      if (token !== request.current) next.stop();
      else { handle.current = next; setReady(true); next.setMetronome(metronomeRef.current);
        // Only a rate chosen while audio was still initializing needs to be re-applied.
        if (rateRef.current !== requestedRate) next.setRate(rateRef.current / 100);
        if (!sameLoop(loopRef.current, requestedLoop)) next.setLoop(loopRef.current);
      }
    } catch {
      if (token !== request.current) return;
      stop(); setError("재생을 시작하지 못했습니다. 브라우저 오디오 권한을 확인해 주세요.");
    }
  }
  return (
    <div role="group" aria-label="재생 제어" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <button type="button" style={button} onClick={state === "stopped" ? () => void play() : stop}>{state === "stopped" ? "Play" : "Stop"}</button>
      <button type="button" style={button} disabled={state !== "stopped" || cursorTick === null}
        title={cursorTick === null ? "편집 커서를 먼저 놓아 주세요." : undefined}
        onClick={() => { if (cursorTick !== null) void play(cursorTick); }}>커서부터 재생</button>
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
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>연습 속도
        <input type="range" min={RATE_MIN_PERCENT} max={RATE_MAX_PERCENT} step={RATE_STEP_PERCENT}
          value={ratePercent} aria-valuetext={`${ratePercent}%`}
          onChange={(event) => changeRate(Number(event.target.value))} />
      </label>
      <span data-testid="practice-rate" data-rate={ratePercent} style={{ fontSize: 13 }}>
        {ratePercent}% · 재생 {Math.round(effectiveTempoBpm(score.tempoBpm, ratePercent / 100) * 10) / 10} BPM (악보 템포 {score.tempoBpm} BPM 유지)
      </span>
      <span role="group" aria-label="연습 속도 프리셋" style={{ display: "inline-flex", gap: 4 }}>
        {RATE_PRESETS.map((preset) => (
          <button key={preset} type="button" style={button} aria-pressed={preset === ratePercent}
            onClick={() => changeRate(preset)}>{preset}%</button>
        ))}
      </span>
      <span role="group" aria-label="A–B 구간 반복" style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <label><input type="checkbox" checked={loopEnabled}
          onChange={(event) => changeLoop(event.target.checked, loopFirst, loopLast)} /> A–B 반복</label>
        <label>반복 첫 마디 <input type="number" inputMode="numeric" min={1} max={measureCount} step={1} value={loopFirst}
          style={measureInput} onChange={(event) => changeLoop(loopEnabled, Number(event.target.value), loopLast)} /></label>
        <label>반복 마지막 마디 <input type="number" inputMode="numeric" min={1} max={measureCount} step={1} value={loopLast}
          style={measureInput} onChange={(event) => changeLoop(loopEnabled, loopFirst, Number(event.target.value))} /></label>
        <span data-testid="practice-loop" data-loop={activeLoop ? "on" : "off"}
          data-start-tick={activeLoop?.startTick ?? ""} data-end-tick={activeLoop?.endTick ?? ""} style={{ fontSize: 13 }}>
          {activeLoop ? `${loopFirst}–${loopLast}마디 반복 중` : "반복 꺼짐"}
        </span>
        {loopEnabled && !loopRange ? (
          <span data-testid="practice-loop-error" style={{ fontSize: 13, color: "#b42318" }}>
            반복 구간은 1–{measureCount}마디 안에서 첫 마디가 마지막 마디보다 크지 않아야 합니다.
          </span>
        ) : null}
      </span>
      <progress aria-label="악보 재생 위치" max={(activeLoop ? scoreLengthTicks(score) : playbackEndTick(score)) || 1} value={position?.tick ?? 0} style={{ maxWidth: "100%" }} />
      <output data-testid="playback-position" data-tick={Math.floor(position?.tick ?? 0)} style={{ fontSize: 13 }}>
        {state === "stopped" ? "정지" : state === "paused" ? "일시정지" : "재생 중"}
        {" · "}{position?.measure ?? 1}마디 {position?.beat ?? 1}박 · {Math.floor(position?.tick ?? 0)} ticks
      </output>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
