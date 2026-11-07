"use client";

import { useEffect, useRef, useState } from "react";
import type { ScoreRepository } from "@/application/ports";
import { scoreStore } from "@/store/score-store";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * canonical Score 변경을 감지해 자동 저장한다.
 * Score 자체는 scoreStore가 소유하며, 이 훅은 저장만 조율한다.
 */
export function useAutosave(
  repository: ScoreRepository,
  delayMs = 400,
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(null);
  // Preserve write order even when an older repository.save is still pending.
  const pending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    const report = (value: SaveStatus) => { if (active) setStatus(value); };
    const flush = () => {
      const state = scoreStore.getState();
      if (!state) return;
      const snapshot = state.current;
      const serialized = JSON.stringify(snapshot);
      pending.current = pending.current.then(async () => {
        if (serialized === lastSaved.current) {
          if (JSON.stringify(scoreStore.getState()?.current) === serialized) report("saved");
          return;
        }
        report("saving");
        try {
          await repository.save(snapshot);
          lastSaved.current = serialized;
          if (JSON.stringify(scoreStore.getState()?.current) === serialized) report("saved");
        } catch {
          report("error");
        }
      });
      return pending.current;
    };

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
      void flush();
    };
  }, [repository, delayMs]);

  return status;
}
