"use client";

import { useEffect, useRef } from "react";
import type { NoteLabelMode } from "@/domain/music-theory";
import type { Score } from "@/domain/score/types";
import { NotationRenderError, renderScoreInto } from "@/adapters/vexflow/renderScore";

const NO_RANGE: readonly string[] = [];
/** Latest range selection per staff element, so an async redraw can re-apply it without a redraw of its own. */
const rangeByStaff = new WeakMap<HTMLElement, readonly string[]>();

/** DOM-only projection of the range selection onto original event glyphs; the Score is untouched. */
function markRange(root: HTMLElement, eventIds: readonly string[]): void {
  const selected = new Set(eventIds);
  root.querySelectorAll?.("[data-event-id]")?.forEach((element) => {
    if (selected.has(element.getAttribute("data-event-id") ?? "")) element.setAttribute("data-range-selected", "true");
    else element.removeAttribute("data-range-selected");
  });
}

export function StaffView({ score, cursorTick = null, labelMode = "none", onSelectEvent, rangeEventIds = NO_RANGE }: {
  score: Score; cursorTick?: number | null; labelMode?: NoteLabelMode; onSelectEvent?: (eventId: string) => void;
  /** Original event IDs of the current range selection. Changing it does not redraw the SVG. */
  rangeEventIds?: readonly string[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    rangeByStaff.set(element, rangeEventIds);
    markRange(element, rangeEventIds);
  }, [rangeEventIds]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const controller = new AbortController();
    renderScoreInto(element, score, { cursorTick, labelMode, signal: controller.signal }).then(() => {
      if (!controller.signal.aborted) markRange(element, rangeByStaff.get(element) ?? NO_RANGE);
    // Two-argument form: the failure notice must land in the same microtask turn as before.
    }, (error: unknown) => {
      if (controller.signal.aborted) return;
      // Renderer owns this DOM subtree. Never leave an old or partially drawn SVG on failure.
      const notice = element.ownerDocument.createElement("p");
      notice.setAttribute("role", "alert"); notice.setAttribute("data-testid", "notation-error");
      notice.textContent = error instanceof NotationRenderError ? `정확한 기보를 표시할 수 없습니다. ${error.message}`
        : "악보를 표시하지 못했습니다. 원본 악보·재생·저장·JSON 백업은 유지됩니다.";
      element.replaceChildren(notice);
    });
    return () => controller.abort();
  }, [score, cursorTick, labelMode]);

  return (
    <div
      ref={ref}
      data-testid="staff"
      // A wide score scrolls sideways; keyboard users scroll it with the arrow keys once it has focus (WCAG 2.1.1).
      role="region"
      aria-label="악보"
      tabIndex={0}
      onClick={(event) => {
        if (!onSelectEvent || !(event.target instanceof Element)) return;
        const id = event.target.closest("[data-event-id]")?.getAttribute("data-event-id");
        if (id && score.parts[0]?.measures.some((measure) => measure.events.some((item) => item.id === id))) onSelectEvent(id);
      }}
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
