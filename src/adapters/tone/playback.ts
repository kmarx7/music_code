import {
  DEFAULT_PRACTICE_RATE, isValidPracticeRate, mergeTiedNotes, playbackEndTick, playbackLoopIssue,
  playbackLoopTick, playbackPositionAt, playbackSecondsPerTick, TICKS_PER_QUARTER,
} from "@/domain/score";
import type { PlaybackLoop, PlaybackPosition, Score } from "@/domain/score";

export type PlaybackState = "playing" | "paused" | "stopped";
export interface PlaybackHandle {
  stop(): void;
  pause(): void;
  resume(): void;
  setMetronome(enabled: boolean): void;
  /** Practice rate (0.25–1.5). Playing: reschedules from the current tick. Paused: applies on resume. */
  setRate(rate: number): void;
  /** A–B loop [startTick, endTick) or null. Keeps the tick when it is inside the range, else moves to A. */
  setLoop(loop: PlaybackLoop | null): void;
  getPosition(): PlaybackPosition;
}

/** How far ahead of the audio clock loop passes are scheduled. The UI timer only tops this up. */
const LOOP_LOOKAHEAD_SECONDS = 2;
/** Upper bound of passes scheduled by one top-up, so a tiny range can never block the main thread. */
const LOOP_MAX_PASSES_PER_TOP_UP = 64;

function assertLoop(score: Score, loop: PlaybackLoop | null): void {
  const issue = loop ? playbackLoopIssue(score, loop) : null;
  if (issue) throw new RangeError(`지원하지 않는 반복 구간입니다 (${issue}).`);
}

/** Tone owns audio scheduling; ticks, cursor and tie semantics come from the canonical Score. */
export async function playScore(
  score: Score,
  options?: {
    metronome?: boolean;
    /** Non-destructive practice rate; the Score tempo is never modified. Defaults to 1. */
    rate?: number;
    /** Non-destructive A–B loop; playback starts at A and never ends on its own. */
    loop?: PlaybackLoop | null;
    onPosition?: (position: PlaybackPosition) => void;
    onState?: (state: PlaybackState) => void;
    onEnd?: () => void;
  },
): Promise<PlaybackHandle> {
  let rate = options?.rate ?? DEFAULT_PRACTICE_RATE;
  // Validate before any audio exists so an invalid rate or range can never be approximated or half-applied.
  let tickSeconds = playbackSecondsPerTick(score.tempoBpm, rate);
  let loop: PlaybackLoop | null = options?.loop ? { ...options.loop } : null;
  assertLoop(score, loop);
  const Tone = await import("tone");
  await Tone.start();
  const part = score.parts[0];
  const notes = part ? mergeTiedNotes(part) : [];
  const tiedHeads = new Set(part?.ties.map((tie) => tie.from));
  const endTick = playbackEndTick(score);
  let state: PlaybackState = "stopped";
  let finished = false;
  let originTick = loop ? loop.startTick : 0;
  let startAt = 0;
  /** Number of passes already handed to Tone since the last start(); pass 0 begins at originTick. */
  let scheduledPasses = 0;
  let metronome = options?.metronome ?? false;
  let synth: InstanceType<typeof Tone.Synth> | undefined;
  let click: InstanceType<typeof Tone.Synth> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  function elapsedTicks(): number {
    return Math.max(0, Tone.immediate() - startAt) / tickSeconds;
  }
  function position(): PlaybackPosition {
    // Raw AudioContext time excludes Tone.now()'s scheduling look-ahead.
    const linearTick = state === "playing"
      ? (loop ? originTick + elapsedTicks() : Math.min(endTick, originTick + elapsedTicks()))
      : originTick;
    // Avoid floating point drift selecting the previous segment at an exact beat boundary.
    const nearestTick = Math.round(linearTick);
    const exactTick = Math.abs(linearTick - nearestTick) < 1e-7 ? nearestTick : linearTick;
    const tick = loop && state === "playing" ? playbackLoopTick(loop, originTick, exactTick - originTick) : exactTick;
    const projection = playbackPositionAt(score, tick);
    return state === "playing" && Tone.immediate() >= startAt
      ? projection : { ...projection, activeNoteIds: [] };
  }
  function release() {
    clearInterval(timer); timer = undefined;
    synth?.dispose(); synth = undefined;
    click?.dispose(); click = undefined;
  }
  // A pass is one traversal up to B (or to the end without a loop). Its start is pure audio-time arithmetic,
  // so loop boundaries never depend on when the UI timer happens to fire.
  function passFromTick(pass: number): number {
    return loop && pass > 0 ? loop.startTick : originTick;
  }
  function passStartsAt(pass: number): number {
    if (!loop || pass === 0) return startAt;
    const ticksBefore = (loop.endTick - originTick) + (pass - 1) * (loop.endTick - loop.startTick);
    return startAt + ticksBefore * tickSeconds;
  }
  function currentPass(): number {
    if (!loop) return 0;
    const linearTick = originTick + elapsedTicks();
    return linearTick < loop.endTick ? 0 : 1 + Math.floor((linearTick - loop.endTick) / (loop.endTick - loop.startTick));
  }
  function scheduleNotes(pass: number) {
    if (!synth) return;
    const fromTick = passFromTick(pass);
    const toTick = loop ? loop.endTick : Infinity;
    const at = passStartsAt(pass);
    for (const note of notes) {
      // [from, to): an event starting exactly at B belongs to the next pass, not this one.
      if (note.startTick >= toTick) continue;
      const noteEnd = Math.min(note.startTick + note.durationTicks, toTick);
      if (noteEnd <= fromTick) continue;
      const onset = Math.max(note.startTick, fromTick);
      // Tied segments sustain through their boundaries, without repeated attacks.
      const gate = tiedHeads.has(note.id) ? 1 : 0.9;
      synth.triggerAttackRelease(Tone.Frequency(note.pitch.midi, "midi").toFrequency(),
        Math.max(0.001, (noteEnd - onset) * tickSeconds * gate),
        at + (onset - fromTick) * tickSeconds);
    }
  }
  function scheduleClickPass(pass: number, afterTick: number) {
    if (!click || !part) return;
    const fromTick = passFromTick(pass);
    const toTick = loop ? loop.endTick : endTick;
    const at = passStartsAt(pass);
    const beatTicks = TICKS_PER_QUARTER * 4 / part.timeSignature.denominator;
    for (let tick = Math.ceil(Math.max(fromTick, afterTick) / beatTicks) * beatTicks; tick < toTick; tick += beatTicks) {
      const accent = (tick / beatTicks) % part.timeSignature.numerator === 0;
      click.triggerAttackRelease(accent ? 1200 : 800, 0.025, at + (tick - fromTick) * tickSeconds);
    }
  }
  /** Replaces every pending click. `afterTick` skips beats of the current pass that already sounded. */
  function scheduleClicks(afterTick: number) {
    click?.dispose(); click = undefined;
    if (!metronome || !part) return;
    click = new Tone.Synth({ volume: -18, oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.01, sustain: 0, release: 0.01 } }).toDestination();
    const first = currentPass();
    scheduleClickPass(first, afterTick);
    for (let pass = first + 1; pass < scheduledPasses; pass += 1) scheduleClickPass(pass, passFromTick(pass));
  }
  function topUpLoop() {
    if (!loop) return;
    const horizon = Tone.immediate() + LOOP_LOOKAHEAD_SECONDS;
    for (let added = 0; added < LOOP_MAX_PASSES_PER_TOP_UP && passStartsAt(scheduledPasses) < horizon; added += 1) {
      scheduleNotes(scheduledPasses);
      scheduleClickPass(scheduledPasses, passFromTick(scheduledPasses));
      scheduledPasses += 1;
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
    scheduleNotes(0);
    scheduledPasses = 1;
    scheduleClicks(originTick);
    topUpLoop();
    options?.onState?.(state); options?.onPosition?.(position());
    timer = setInterval(() => {
      topUpLoop();
      const current = position();
      if (!loop && current.tick >= endTick) { stop(); options?.onEnd?.(); }
      else options?.onPosition?.(current);
    }, 25);
  }
  /** Same lifecycle as pause→resume: fix the tick on the old clock, drop every old schedule, restart. */
  function reschedule(apply: () => void) {
    if (state === "playing") { originTick = position().tick; release(); apply(); start(); }
    else { apply(); options?.onPosition?.(position()); }
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
      reschedule(() => { rate = next; tickSeconds = playbackSecondsPerTick(score.tempoBpm, rate); });
    },
    setLoop(next) {
      assertLoop(score, next);
      if (finished) return;
      if (next?.startTick === loop?.startTick && next?.endTick === loop?.endTick) return;
      reschedule(() => {
        loop = next ? { ...next } : null;
        if (loop && (originTick < loop.startTick || originTick >= loop.endTick)) originTick = loop.startTick;
      });
    },
    getPosition: position,
  };
}
