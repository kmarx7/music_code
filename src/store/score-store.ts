import type { Score } from "@/domain/score/types";
import {
  applyCommand,
  createEditSession,
  redo,
  undo,
} from "@/application/edit-session";
import type { EditSessionState } from "@/application/edit-session";
import type { CommandResult, EditCommand } from "@/domain/commands/types";

/**
 * 단일 canonical Score 소유자.
 * React에 의존하지 않는 순수 store로, UI는 useScoreStore 훅으로 구독한다.
 */
export interface ScoreStore {
  getState(): EditSessionState | null;
  subscribe(listener: () => void): () => void;
  init(score: Score): void;
  dispatch(command: EditCommand): CommandResult | null;
  undo(): void;
  redo(): void;
}

export function createScoreStore(): ScoreStore {
  let state: EditSessionState | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    init: (score) => {
      state = createEditSession(score);
      notify();
    },

    dispatch: (command) => {
      if (!state) return null;
      const outcome = applyCommand(state, command);
      if (outcome.result.ok) {
        state = outcome.session;
        notify();
      }
      return outcome.result;
    },

    undo: () => {
      if (!state) return;
      state = undo(state);
      notify();
    },

    redo: () => {
      if (!state) return;
      state = redo(state);
      notify();
    },
  };
}

export const scoreStore = createScoreStore();
