import type { Score } from "./types";
import { measureTicks } from "./create";
import { TICKS_PER_QUARTER } from "./constants";

/** Read-only cursor projection in canonical absolute ticks (never persisted). */
export interface PlaybackPosition {
  readonly tick: number;
  readonly measure: number;
  readonly beat: number;
  readonly activeNoteIds: readonly string[];
}

/** Practice rate bounds (PRD MVP-008). Runtime-only: never stored in Score, JSON or history (ADR-004). */
export const PRACTICE_RATE_MIN = 0.25;
export const PRACTICE_RATE_MAX = 1.5;
export const DEFAULT_PRACTICE_RATE = 1;

export function isValidPracticeRate(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate)
    && rate >= PRACTICE_RATE_MIN && rate <= PRACTICE_RATE_MAX;
}

function assertPracticeRate(rate: unknown): asserts rate is number {
  if (!isValidPracticeRate(rate)) {
    throw new RangeError(`연습 속도는 ${PRACTICE_RATE_MIN}..${PRACTICE_RATE_MAX} 범위여야 합니다 (${String(rate)}).`);
  }
}

/** Playback-only tempo. Deliberately not clamped to the stored 20–400 BPM Score range. */
export function effectiveTempoBpm(tempoBpm: number, rate: number): number {
  assertPracticeRate(rate);
  return tempoBpm * rate;
}

/** The single clock shared by notes, rests, ties, metronome clicks and the cursor. */
export function playbackSecondsPerTick(tempoBpm: number, rate: number = DEFAULT_PRACTICE_RATE): number {
  return 60 / effectiveTempoBpm(tempoBpm, rate) / TICKS_PER_QUARTER;
}

export function playbackEndTick(score: Score): number {
  const part = score.parts[0];
  if (!part) return 0;
  const events = part.measures.flatMap((measure) => measure.events);
  return events.length
    ? Math.max(...events.map((event) => event.startTick + event.durationTicks))
    : part.measures.length * measureTicks(part.timeSignature);
}

export function playbackPositionAt(score: Score, tick: number): PlaybackPosition {
  const part = score.parts[0];
  const meter = part.timeSignature;
  const barTicks = measureTicks(meter);
  const beatTicks = TICKS_PER_QUARTER * 4 / meter.denominator;
  return {
    tick,
    measure: Math.floor(tick / barTicks) + 1,
    beat: Math.floor((tick % barTicks) / beatTicks) + 1,
    activeNoteIds: part.measures.flatMap((measure) => measure.events)
      .filter((event) => event.kind === "note" && event.startTick <= tick && tick < event.startTick + event.durationTicks)
      .map((event) => event.id),
  };
}

/** A–B practice loop as a half-open tick range [startTick, endTick). Runtime-only (ADR-004). */
export interface PlaybackLoop {
  readonly startTick: number;
  readonly endTick: number;
}

export type PlaybackLoopIssue = "NOT_INTEGER" | "EMPTY_RANGE" | "OUT_OF_SCORE";

/** Full length of the first part, including trailing empty measures (unlike playbackEndTick). */
export function scoreLengthTicks(score: Score): number {
  const part = score.parts[0];
  return part ? part.measures.length * measureTicks(part.timeSignature) : 0;
}

export function playbackLoopIssue(score: Score, loop: PlaybackLoop): PlaybackLoopIssue | null {
  if (!Number.isInteger(loop.startTick) || !Number.isInteger(loop.endTick)) return "NOT_INTEGER";
  if (loop.startTick >= loop.endTick) return "EMPTY_RANGE";
  if (loop.startTick < 0 || loop.endTick > scoreLengthTicks(score)) return "OUT_OF_SCORE";
  return null;
}

/** 1-based inclusive measure numbers → tick range. Null when the range is not inside the score. */
export function measureRangeLoop(score: Score, firstMeasure: number, lastMeasure: number): PlaybackLoop | null {
  const part = score.parts[0];
  if (!part || !Number.isInteger(firstMeasure) || !Number.isInteger(lastMeasure)) return null;
  if (firstMeasure < 1 || lastMeasure < firstMeasure || lastMeasure > part.measures.length) return null;
  const barTicks = measureTicks(part.timeSignature);
  return { startTick: (firstMeasure - 1) * barTicks, endTick: lastMeasure * barTicks };
}

/** Tick reached after `elapsedTicks` from `originTick`; B itself belongs to the next pass. */
export function playbackLoopTick(loop: PlaybackLoop, originTick: number, elapsedTicks: number): number {
  const linear = originTick + elapsedTicks;
  if (linear < loop.endTick) return linear;
  return loop.startTick + ((linear - loop.startTick) % (loop.endTick - loop.startTick));
}
