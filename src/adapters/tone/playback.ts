import {
  DEFAULT_PRACTICE_RATE, isValidPracticeRate, mergeTiedNotes, playbackEndTick, playbackPositionAt,
  playbackSecondsPerTick, TICKS_PER_QUARTER,
} from "@/domain/score";
import type { PlaybackPosition, Score } from "@/domain/score";

export type PlaybackState = "playing" | "paused" | "stopped";
export interface PlaybackHandle {
  stop(): void;
  pause(): void;
  resume(): void;
  setMetronome(enabled: boolean): void;
  /** Practice rate (0.25–1.5). Playing: reschedules from the current tick. Paused: applies on resume. */
  setRate(rate: number): void;
  getPosition(): PlaybackPosition;
}

/** Tone owns audio scheduling; ticks, cursor and tie semantics come from the canonical Score. */
export async function playScore(
  score: Score,
  options?: {
    metronome?: boolean;
    /** Non-destructive practice rate; the Score tempo is never modified. Defaults to 1. */
    rate?: number;
    onPosition?: (position: PlaybackPosition) => void;
    onState?: (state: PlaybackState) => void;
    onEnd?: () => void;
  },
): Promise<PlaybackHandle> {
  let rate = options?.rate ?? DEFAULT_PRACTICE_RATE;
  // Validate before any audio exists so an invalid rate can never be approximated or half-applied.
  let tickSeconds = playbackSecondsPerTick(score.tempoBpm, rate);
  const Tone = await import("tone");
  await Tone.start();
  const part = score.parts[0];
  const notes = part ? mergeTiedNotes(part) : [];
  const tiedHeads = new Set(part?.ties.map((tie) => tie.from));
  const endTick = playbackEndTick(score);
  let state: PlaybackState = "stopped";
  let finished = false;
  let originTick = 0;
  let startAt = 0;
  let metronome = options?.metronome ?? false;
  let synth: InstanceType<typeof Tone.Synth> | undefined;
  let click: InstanceType<typeof Tone.Synth> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  function position(): PlaybackPosition {
    // Raw AudioContext time excludes Tone.now()'s scheduling look-ahead.
    const rawTick = state === "playing"
      ? Math.min(endTick, originTick + Math.max(0, Tone.immediate() - startAt) / tickSeconds)
      : originTick;
    // Avoid floating point drift selecting the previous segment at an exact beat boundary.
    const nearestTick = Math.round(rawTick);
    const tick = Math.abs(rawTick - nearestTick) < 1e-7 ? nearestTick : rawTick;
    const projection = playbackPositionAt(score, tick);
    return state === "playing" && Tone.immediate() >= startAt
      ? projection : { ...projection, activeNoteIds: [] };
  }
  function release() {
    clearInterval(timer); timer = undefined;
    synth?.dispose(); synth = undefined;
    click?.dispose(); click = undefined;
  }
  function scheduleClicks(fromTick: number) {
    click?.dispose(); click = undefined;
    if (!metronome || !part) return;
    click = new Tone.Synth({ volume: -18, oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.01, sustain: 0, release: 0.01 } }).toDestination();
    const beatTicks = TICKS_PER_QUARTER * 4 / part.timeSignature.denominator;
    for (let tick = Math.ceil(fromTick / beatTicks) * beatTicks; tick < endTick; tick += beatTicks) {
      const accent = (tick / beatTicks) % part.timeSignature.numerator === 0;
      click.triggerAttackRelease(accent ? 1200 : 800, 0.025, startAt + (tick - originTick) * tickSeconds);
    }
  }
  function stop() {
    if (finished) return;
    finished = true; release(); state = "stopped"; originTick = 0;
    options?.onPosition?.(position()); options?.onState?.(state);
  }
  function start() {
    state = "playing";
    startAt = Tone.now() + 0.1;
    synth = new Tone.Synth().toDestination();
    for (const note of notes) {
      const noteEnd = note.startTick + note.durationTicks;
      if (noteEnd <= originTick) continue;
      const onset = Math.max(note.startTick, originTick);
      // Tied segments sustain through their boundaries, without repeated attacks.
      const gate = tiedHeads.has(note.id) ? 1 : 0.9;
      synth.triggerAttackRelease(Tone.Frequency(note.pitch.midi, "midi").toFrequency(),
        Math.max(0.001, (noteEnd - onset) * tickSeconds * gate),
        startAt + (onset - originTick) * tickSeconds);
    }
    scheduleClicks(originTick);
    options?.onState?.(state); options?.onPosition?.(position());
    timer = setInterval(() => {
      const current = position();
      if (current.tick >= endTick) { stop(); options?.onEnd?.(); }
      else options?.onPosition?.(current);
    }, 25);
  }
  try { start(); } catch (error) { release(); throw error; }
  return {
    stop,
    pause() {
      if (finished || state !== "playing") return;
      originTick = position().tick; release(); state = "paused";
      options?.onPosition?.(position()); options?.onState?.(state);
    },
    resume() { if (!finished && state === "paused") start(); },
    setMetronome(enabled) {
      if (finished || enabled === metronome) return;
      metronome = enabled;
      if (state === "playing") {
        // Skip elapsed clicks, including a beat that has already sounded.
        const from = Tone.immediate() < startAt ? originTick : position().tick + 0.001;
        scheduleClicks(from);
      }
    },
    setRate(next) {
      if (!isValidPracticeRate(next)) throw new RangeError(`지원하지 않는 연습 속도입니다 (${String(next)}).`);
      if (finished || next === rate) return;
      if (state === "playing") {
        // Same lifecycle as pause→resume: fix the tick on the old clock, drop every old schedule, restart.
        originTick = position().tick; release();
        rate = next; tickSeconds = playbackSecondsPerTick(score.tempoBpm, rate);
        start();
      } else {
        rate = next; tickSeconds = playbackSecondsPerTick(score.tempoBpm, rate);
      }
    },
    getPosition: position,
  };
}
