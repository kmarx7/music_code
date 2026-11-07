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

  useEffect(() => {
    const flush = async () => {
      const state = scoreStore.getState();
      if (!state) return;
      const serialized = JSON.stringify(state.current);
      if (serialized === lastSaved.current) return;

      setStatus("saving");
      try {
        await repository.save(state.current);
        lastSaved.current = serialized;
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    };

    const unsubscribe = scoreStore.subscribe(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, delayMs);
    });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
      const state = scoreStore.getState();
      if (state) {
        repository.save(state.current).catch(() => {});
      }
    };
  }, [repository, delayMs]);

  return status;
}
