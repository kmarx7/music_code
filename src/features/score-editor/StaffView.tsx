"use client";

import { useEffect, useRef } from "react";
import type { NoteLabelMode } from "@/domain/music-theory";
import type { Score } from "@/domain/score/types";
import { renderScoreInto } from "@/adapters/vexflow/renderScore";

export function StaffView({ score, cursorTick = null, labelMode = "none" }: { score: Score; cursorTick?: number | null; labelMode?: NoteLabelMode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelled = false;

    renderScoreInto(element, score, { cursorTick, labelMode }).catch(() => {
      if (!cancelled) {
        element.textContent = "악보를 표시하지 못했습니다.";
      }
    });

    return () => {
      cancelled = true;
    };
  }, [score, cursorTick, labelMode]);

  return (
    <div
      ref={ref}
      data-testid="staff"
      style={{
        overflowX: "auto",
        background: "#ffffff",
        border: "1px solid #d9dee8",
        borderRadius: 8,
        padding: 8,
      }}
    />
  );
}
