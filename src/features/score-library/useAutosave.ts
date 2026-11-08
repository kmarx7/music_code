"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ScoreConflictError, type ScoreRepository } from "@/application/ports";
import { scoreStore } from "@/store/score-store";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict" | "deleted";

export interface AutosaveHandle {
  /** Wait for the latest snapshot, including edits made while an older save is pending. */
  flush(): Promise<boolean>;
  /** Only after explicit discard confirmation or a successful new-ID backup. */
  allowDiscard?(): void;
  /** Synchronous session metadata only; never reads/writes the repository. */
  getSnapshot?(): { revision: number; status: SaveStatus };
}

/**
 * canonical Score 변경을 감지해 자동 저장한다.
 * Score 자체는 scoreStore가 소유하며, 이 훅은 저장만 조율한다.
 */
export function useAutosave(
  repository: ScoreRepository,
  delayMs = 400,
  controlRef?: RefObject<AutosaveHandle | null>,
  initiallySaved = false,
  initialRevision = 1,
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const statusRef = useRef<SaveStatus>("idle");
  const revision = useRef(initialRevision);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(initiallySaved ? JSON.stringify(scoreStore.getState()?.current) : null);
  // Preserve write order even when an older repository.save is still pending.
  const pending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    let explicitFlush: Promise<boolean> | undefined;
    const scoreId = scoreStore.getState()?.current.id;
    let blocked = false;
    let leavingGuard = false;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const updateGuard = () => {
      if (typeof window === "undefined") return;
      const dirty = blocked || JSON.stringify(scoreStore.getState()?.current) !== lastSaved.current;
      if (dirty && !leavingGuard) window.addEventListener("beforeunload", beforeUnload);
      if (!dirty && leavingGuard) window.removeEventListener("beforeunload", beforeUnload);
      leavingGuard = dirty;
    };
    const report = (value: SaveStatus) => { if (active) { statusRef.current = value; setStatus(value); updateGuard(); } };
    const fail = (error: unknown) => {
      if (error instanceof ScoreConflictError) {
        blocked = true;
        if (timer.current) clearTimeout(timer.current);
        report(error.code === "DELETED" ? "deleted" : "conflict");
      } else report("error");
    };
    const verify = async () => {
      const stored = await repository.read(scoreId!);
      if (!stored) throw new ScoreConflictError("DELETED");
      if (stored.revision !== revision.current) throw new ScoreConflictError("CONFLICT");
    };
    const flush = async (includeLatest = false): Promise<boolean> => {
      if (timer.current) clearTimeout(timer.current);
      if (blocked) return false;
      while (true) {
        const snapshot = scoreStore.getState()?.current;
        if (!snapshot || snapshot.id !== scoreId) return true;
        const serialized = JSON.stringify(snapshot);
        let saved = false;
        pending.current = pending.current.then(async () => {
          if (blocked) return;
          try {
            if (serialized === lastSaved.current) { await verify(); saved = true; return; }
            report("saving");
            revision.current = await repository.save(snapshot, revision.current);
            lastSaved.current = serialized;
            saved = true;
          } catch (error) {
            fail(error);
          }
        });
        await pending.current;
        if (blocked) return false;
        if (!saved) return false;
        if (JSON.stringify(scoreStore.getState()?.current) === serialized) {
          report("saved");
          return true;
        }
        if (!includeLatest) return true;
        // Explicit navigation flush includes edits made during an older write.
      }
    };
    if (controlRef) controlRef.current = { flush: () => {
      // Manual save and navigation share one request while it includes the latest edits.
      explicitFlush ??= flush(true).finally(() => { explicitFlush = undefined; });
      return explicitFlush;
    }, allowDiscard: () => {
      if (typeof window !== "undefined") window.removeEventListener("beforeunload", beforeUnload);
    }, getSnapshot: () => ({ revision: revision.current, status: statusRef.current }) };

    const unsubscribe = scoreStore.subscribe(() => {
      // 디바운스 대기 중에도 이전 편집의 "저장됨"을 표시하지 않는다.
      if (blocked) { updateGuard(); return; }
      report("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, delayMs);
    });

    const recheck = () => {
      pending.current = pending.current.then(async () => {
        if (blocked || !active) return;
        try { await verify(); } catch (error) { fail(error); }
      });
    };
    const unsubscribeChanges = repository.subscribe?.((change) => { if (change.id === scoreId) recheck(); });
    const hidden = () => { if (document.visibilityState === "hidden") void flush(true); };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", recheck);
      window.addEventListener("pageshow", recheck);
      document.addEventListener("visibilitychange", hidden);
      updateGuard();
    }
    return () => {
      unsubscribeChanges?.();
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", beforeUnload);
        window.removeEventListener("focus", recheck);
        window.removeEventListener("pageshow", recheck);
        document.removeEventListener("visibilitychange", hidden);
      }
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
      active = false;
      if (controlRef) controlRef.current = null;
      void flush();
    };
  }, [repository, delayMs, controlRef]);

  return status;
}
