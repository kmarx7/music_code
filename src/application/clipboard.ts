import type { Score } from "@/domain/score/types";
import { cloneScoreEvent, type ClipboardPayload } from "@/domain/score/clipboard";
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
