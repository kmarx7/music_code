"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ScoreRepository } from "@/application/ports";
import { scoreStore } from "@/store/score-store";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutosaveHandle {
  /** Wait for the latest snapshot, including edits made while an older save is pending. */
  flush(): Promise<boolean>;
}

/**
 * canonical Score 변경을 감지해 자동 저장한다.
 * Score 자체는 scoreStore가 소유하며, 이 훅은 저장만 조율한다.
 */
export function useAutosave(
  repository: ScoreRepository,
  delayMs = 400,
  controlRef?: RefObject<AutosaveHandle | null>,
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(null);
  // Preserve write order even when an older repository.save is still pending.
  const pending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    const report = (value: SaveStatus) => { if (active) setStatus(value); };
    const flush = async (includeLatest = false): Promise<boolean> => {
      if (timer.current) clearTimeout(timer.current);
      const scoreId = scoreStore.getState()?.current.id;
      while (true) {
        const snapshot = scoreStore.getState()?.current;
        if (!snapshot || snapshot.id !== scoreId) return true;
        const serialized = JSON.stringify(snapshot);
        let saved = false;
        pending.current = pending.current.then(async () => {
          if (serialized === lastSaved.current) { saved = true; return; }
          report("saving");
          try {
            await repository.save(snapshot);
            lastSaved.current = serialized;
            saved = true;
          } catch {
            report("error");
          }
        });
        await pending.current;
        if (!saved) return false;
        if (JSON.stringify(scoreStore.getState()?.current) === serialized) {
          report("saved");
          return true;
        }
        if (!includeLatest) return true;
        // Explicit navigation flush includes edits made during an older write.
      }
    };
    if (controlRef) controlRef.current = { flush: () => flush(true) };

    const unsubscribe = scoreStore.subscribe(() => {
      // 디바운스 대기 중에도 이전 편집의 "저장됨"을 표시하지 않는다.
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, delayMs);
    });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
      active = false;
      if (controlRef) controlRef.current = null;
      void flush();
    };
  }, [repository, delayMs, controlRef]);

  return status;
}
