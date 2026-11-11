import type { Score, ScoreEvent, TieLink } from "./types";
import { measureTicks } from "./create";
import { chainIdsOf } from "./tie";
import { measureRangeLoop, playbackLoopIssue, type PlaybackLoopIssue } from "./playback";

/** Half-open tick range [startTick, endTick) on the first part. UI-only: never stored (ADR-004). */
export interface ScoreRange {
  readonly startTick: number;
  readonly endTick: number;
}

/**
 * Read-only projection of a contiguous range selection (C-08). Gaps are implied by the range itself;
 * `eventIds` are original event IDs in time order and `ties` are the links fully inside the range.
 */
export interface RangeSelection extends ScoreRange {
  readonly eventIds: readonly string[];
  readonly noteCount: number;
  readonly restCount: number;
  readonly ties: readonly TieLink[];
}

export type RangeSelectionIssue = PlaybackLoopIssue | "CUTS_EVENT" | "CUTS_TIE";

export type RangeSelectionResult =
  | { readonly ok: true; readonly selection: RangeSelection }
  | {
    readonly ok: false;
    readonly issue: RangeSelectionIssue;
    readonly message: string;
    /** Events that block the selection (the cut event, or the whole tie chain to include). */
    readonly eventIds: readonly string[];
  };

const RANGE_MESSAGES: Record<PlaybackLoopIssue, string> = {
  NOT_INTEGER: "선택 범위는 정수 tick이어야 합니다.",
  EMPTY_RANGE: "선택 범위의 끝은 시작보다 뒤여야 합니다.",
  OUT_OF_SCORE: "선택 범위가 악보를 벗어났습니다.",
};

function reject(issue: RangeSelectionIssue, message: string, eventIds: readonly string[] = []): RangeSelectionResult {
  return { ok: false, issue, message, eventIds };
}

/**
 * Selects the first part's events inside [startTick, endTick). Rests and gaps are included as-is.
 * A boundary that cuts an event or a tie chain is rejected; nothing is trimmed or split.
 */
export function selectScoreRange(score: Score, range: ScoreRange): RangeSelectionResult {
  const part = score.parts[0];
  if (!part) return reject("OUT_OF_SCORE", RANGE_MESSAGES.OUT_OF_SCORE);
  const rangeIssue = playbackLoopIssue(score, range);
  if (rangeIssue) return reject(rangeIssue, RANGE_MESSAGES[rangeIssue]);

  const { startTick, endTick } = range;
  const events = part.measures.flatMap((measure) => measure.events)
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id));
  const endOf = (event: ScoreEvent): number => event.startTick + event.durationTicks;
  const cut = events.filter((event) => [startTick, endTick]
    .some((boundary) => event.startTick < boundary && boundary < endOf(event)));
  if (cut.length) {
    return reject("CUTS_EVENT", "선택 경계가 음표·쉼표의 중간을 자릅니다. 이벤트 경계에 맞춰 선택해 주세요.",
      cut.map((event) => event.id));
  }

  const inside = events.filter((event) => event.startTick >= startTick && event.startTick < endTick);
  const ids = new Set(inside.map((event) => event.id));
  const cutTie = part.ties.find((tie) => ids.has(tie.from) !== ids.has(tie.to));
  if (cutTie) {
    const chain = chainIdsOf(part, cutTie.from);
    const members = events.filter((event) => chain.includes(event.id));
    const barTicks = measureTicks(part.timeSignature);
    const first = Math.floor(members[0].startTick / barTicks) + 1;
    const last = Math.floor((endOf(members[members.length - 1]) - 1) / barTicks) + 1;
    return reject("CUTS_TIE",
      `붙임줄로 이어진 음을 자르는 선택입니다. 이어진 음 전체(${first}–${last}마디)를 포함해 선택해 주세요.`, chain);
  }

  return {
    ok: true,
    selection: {
      startTick,
      endTick,
      eventIds: inside.map((event) => event.id),
      noteCount: inside.filter((event) => event.kind === "note").length,
      restCount: inside.filter((event) => event.kind === "rest").length,
      ties: part.ties.filter((tie) => ids.has(tie.from) && ids.has(tie.to)).map((tie) => ({ ...tie })),
    },
  };
}

/** 1-based inclusive measure numbers → range selection. */
export function selectMeasureRange(score: Score, firstMeasure: number, lastMeasure: number): RangeSelectionResult {
  const range = measureRangeLoop(score, firstMeasure, lastMeasure);
  if (!range) return reject("OUT_OF_SCORE", "유효한 첫 마디와 마지막 마디를 입력해 주세요.");
  return selectScoreRange(score, range);
}
