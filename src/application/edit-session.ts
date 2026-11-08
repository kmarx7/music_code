import type { Score } from "@/domain/score/types";
import { applyEditCommand } from "@/domain/commands/apply";
import type { CommandResult, EditCommand } from "@/domain/commands/types";

export interface EditSessionState {
  current: Score;
  past: readonly Score[];
  future: readonly Score[];
}

export function createEditSession(initial: Score): EditSessionState {
  return { current: initial, past: [], future: [] };
}

export interface ApplyOutcome {
  session: EditSessionState;
  result: CommandResult;
}

/**
 * 실제 변경을 반환한 성공만 기록한다. 실패/동일 Score 결과는 session을 그대로 반환한다.
 * 과거 스냅샷은 불변 Score 참조를 보관한다(원본 Score는 변경되지 않는다).
 */
export function applyCommand(
  session: EditSessionState,
  command: EditCommand,
): ApplyOutcome {
  const result = applyEditCommand(session.current, command);
  if (!result.ok || result.score === session.current) {
    return { session, result };
  }
  return {
    session: {
      current: result.score,
      past: [...session.past, session.current],
      future: [],
    },
    result,
  };
}

export function canUndo(session: EditSessionState): boolean {
  return session.past.length > 0;
}

export function canRedo(session: EditSessionState): boolean {
  return session.future.length > 0;
}

export function undo(session: EditSessionState): EditSessionState {
  if (!canUndo(session)) return session;
  const previous = session.past[session.past.length - 1];
  return {
    current: previous,
    past: session.past.slice(0, -1),
    future: [session.current, ...session.future],
  };
}

export function redo(session: EditSessionState): EditSessionState {
  if (!canRedo(session)) return session;
  const next = session.future[0];
  return {
    current: next,
    past: [...session.past, session.current],
    future: session.future.slice(1),
  };
}
