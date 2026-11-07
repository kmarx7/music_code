"use client";

import { useSyncExternalStore } from "react";
import type { EditSessionState } from "@/application/edit-session";
import { scoreStore } from "@/store/score-store";

export function useScoreState(): EditSessionState | null {
  return useSyncExternalStore(
    scoreStore.subscribe,
    scoreStore.getState,
    () => null,
  );
}
