import type { Score } from "@/domain/score/types";
import { cloneScoreEvent, copyScoreRange, type ClipboardPayload } from "@/domain/score/clipboard";
import type { ScoreRange } from "@/domain/score/selection";
import type { EditCommand } from "@/domain/commands/types";

export type PastePlan =
  | { ok: true; command: EditCommand }
  | { ok: false; message: string };

/**
 * Builds one atomic PasteEvents command. Pure: IDs are injected at the call boundary, and every source ID
 * is replaced by a fresh one (tie references are remapped) so repeated pastes never collide.
 * Target emptiness, measure capacity and notation are validated by the command itself.
 */
export function planPaste(
  score: Score,
  clipboard: ClipboardPayload,
  input: { startTick: number; createId: () => string; partId?: string },
): PastePlan {
  const part = input.partId ? score.parts.find((candidate) => candidate.id === input.partId) : score.parts[0];
  if (!part) return { ok: false, message: "파트가 없습니다." };
  if (clipboard.events.length === 0) return { ok: false, message: "붙여넣을 내용이 없습니다. 먼저 구간을 복사해 주세요." };

  const freshIds = new Map<string, string>();
  const events = clipboard.events.map((event) => {
    const id = input.createId();
    freshIds.set(event.id, id);
    return cloneScoreEvent(event, { id });
  });
  const ties = [];
  for (const tie of clipboard.ties) {
    const from = freshIds.get(tie.from);
    const to = freshIds.get(tie.to);
    if (from === undefined || to === undefined) return { ok: false, message: "클립보드의 붙임줄 정보가 올바르지 않습니다." };
    ties.push({ from, to });
  }
  return {
    ok: true,
    command: {
      type: "PasteEvents", partId: part.id, startTick: input.startTick,
      clipboard: { lengthTicks: clipboard.lengthTicks, events, ties },
    },
  };
}

export type CutPlan =
  | { ok: true; command: EditCommand; clipboard: ClipboardPayload }
  | { ok: false; message: string };

/**
 * Builds one atomic CutEvents command plus the payload that replaces the clipboard.
 * Pure: the caller dispatches the command once and swaps the clipboard only if that dispatch succeeds.
 */
export function planCut(score: Score, range: ScoreRange): CutPlan {
  const part = score.parts[0];
  if (!part) return { ok: false, message: "파트가 없습니다." };
  const copied = copyScoreRange(score, range);
  if (!copied.ok) {
    return { ok: false, message: copied.issue === "EMPTY_SELECTION" ? "잘라낼 음표·쉼표가 없습니다." : copied.message };
  }
  return {
    ok: true,
    command: { type: "CutEvents", partId: part.id, startTick: range.startTick, endTick: range.endTick },
    clipboard: copied.clipboard,
  };
}

export type DeleteRangePlan =
  | { ok: true; command: EditCommand }
  | { ok: false; message: string };

/**
 * Deletes the selected range (MVP-006): the same atomic CutEvents command and tie-chain rules as Cut,
 * but the in-memory clipboard is left as it is. One command, one Undo.
 */
export function planDeleteRange(score: Score, range: ScoreRange): DeleteRangePlan {
  const part = score.parts[0];
  if (!part) return { ok: false, message: "파트가 없습니다." };
  // The copy is only the validation (tie chains, overlaps); its payload is discarded.
  const copied = copyScoreRange(score, range);
  if (!copied.ok) {
    return { ok: false, message: copied.issue === "EMPTY_SELECTION" ? "삭제할 음표·쉼표가 없습니다." : copied.message };
  }
  return { ok: true, command: { type: "CutEvents", partId: part.id, startTick: range.startTick, endTick: range.endTick } };
}
