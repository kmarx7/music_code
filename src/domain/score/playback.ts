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
