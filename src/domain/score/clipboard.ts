import type { Score, ScoreEvent, TieLink } from "./types";
import { eventById } from "./tie";
import { selectScoreRange, type RangeSelectionIssue, type ScoreRange } from "./selection";

/**
 * Read-only copy of a contiguous range (C-08). `events[].startTick` is relative to the range start and
 * `lengthTicks` keeps leading/trailing gaps. Event IDs are the source IDs and only serve as keys for `ties`;
 * a paste must replace them with fresh IDs. In-memory only: never stored in Score, JSON or history.
 */
export interface ClipboardPayload {
  readonly lengthTicks: number;
  readonly events: readonly ScoreEvent[];
  readonly ties: readonly TieLink[];
}

export type CopyRangeResult =
  | { readonly ok: true; readonly clipboard: ClipboardPayload }
  | { readonly ok: false; readonly issue: RangeSelectionIssue | "EMPTY_SELECTION"; readonly message: string };

/** Detached copy: the payload never shares pitch/provenance objects with a Score. */
export function cloneScoreEvent(event: ScoreEvent, patch: { id?: string; startTick?: number } = {}): ScoreEvent {
  const base = { id: patch.id ?? event.id, startTick: patch.startTick ?? event.startTick };
  if (event.kind === "rest") return { ...event, ...base };
  return { ...event, ...base, pitch: { ...event.pitch },
    ...(event.provenance ? { provenance: { ...event.provenance } } : {}) };
}

/** Re-derives the selection from the given Score, so a stale selection can never be copied. */
export function copyScoreRange(score: Score, range: ScoreRange): CopyRangeResult {
  const selected = selectScoreRange(score, range);
  if (!selected.ok) return { ok: false, issue: selected.issue, message: selected.message };
  const { selection } = selected;
  if (selection.eventIds.length === 0) {
    return { ok: false, issue: "EMPTY_SELECTION", message: "복사할 음표·쉼표가 없습니다." };
  }
  const part = score.parts[0];
  return {
    ok: true,
    clipboard: {
      lengthTicks: selection.endTick - selection.startTick,
      events: selection.eventIds.map((id) => {
        const event = eventById(part, id)!;
        return cloneScoreEvent(event, { startTick: event.startTick - selection.startTick });
      }),
      ties: selection.ties.map((tie) => ({ ...tie })),
    },
  };
}
