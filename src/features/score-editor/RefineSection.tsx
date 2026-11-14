"use client";

import { useId, useState, type ReactNode } from "react";

export interface RefineSectionProps {
  title: string;
  /** One line shown next to the title while the section is closed on a phone. */
  summary: string;
  children: ReactNode;
}

/**
 * A 다듬기 tool group. On phones (≤768px) it is a closed row that opens in place, so the mode fits one screen;
 * on wider screens the row is hidden and the content always shows, exactly as before. Open/closed is UI state only.
 * The CSS lives with the editor layout (`EDITOR_CSS`).
 */
export function RefineSection({ title, summary, children }: RefineSectionProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <div className="refine-section" data-open={open ? "true" : "false"}>
      <button type="button" className="refine-toggle" aria-expanded={open} aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}>
        <span className="refine-toggle-title">{title}</span>
        <span className="refine-toggle-summary">{summary}</span>
        <span aria-hidden="true" className="refine-toggle-mark">{open ? "−" : "+"}</span>
      </button>
      <div id={bodyId} className="refine-body">{children}</div>
    </div>
  );
}
