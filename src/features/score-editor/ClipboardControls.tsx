"use client";

import { useState } from "react";
import type { ClipboardPayload, RangeSelection, Score } from "@/domain/score";
import { copyScoreRange, measureTicks, TICKS_PER_QUARTER } from "@/domain/score";
import type { EditCommand } from "@/domain/commands";
import { planCut, planPaste } from "@/application";

interface ClipboardControlsProps {
  score: Score;
  /** Range selection derived from this exact score, or null (a stale selection is never passed in). */
  selection: RangeSelection | null;
  /** Edit cursor tick, or null in append mode. */
  cursorTick: number | null;
  /** In-memory clipboard owned by the editor. Never stored in Score, JSON or history. */
  clipboard: ClipboardPayload | null;
  onCopy: (clipboard: ClipboardPayload) => void;
  /** Dispatches one command through the existing edit session; returns an error message or null. */
  onCommand: (command: EditCommand) => string | null;
  /** Called after a successful paste with the tick right after the pasted block. */
  onPasted: (endTick: number) => void;
}

type Feedback = { kind: "ok" | "error"; text: string };

/**
 * Copy or cut the current range selection / paste at the edit cursor (P3-08, P3-09).
 * Copy is read-only. Cut and Paste are one atomic command each, saved by the existing autosave only.
 * Cut replaces the clipboard only after its command succeeded.
 */
export function ClipboardControls({ score, selection, cursorTick, clipboard, onCopy, onCommand, onPasted }: ClipboardControlsProps) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const part = score.parts[0];
  const barTicks = part ? measureTicks(part.timeSignature) : 1;
  const beatTicks = part ? TICKS_PER_QUARTER * 4 / part.timeSignature.denominator : 1;
  const notes = clipboard?.events.filter((event) => event.kind === "note").length ?? 0;
  const measures = clipboard ? Number((clipboard.lengthTicks / barTicks).toFixed(2)) : 0;

  function copy() {
    if (!selection) return;
    const result = copyScoreRange(score, selection);
    if (!result.ok) { setFeedback({ kind: "error", text: result.message }); return; }
    onCopy(result.clipboard);
    setFeedback({ kind: "ok", text: "선택한 구간을 복사했습니다. 편집 커서를 빈 구간으로 옮긴 뒤 붙여넣으세요." });
  }

  function cut() {
    if (!selection) return;
    const plan = planCut(score, selection);
    const error = plan.ok ? onCommand(plan.command) : plan.message;
    if (!plan.ok || error !== null) { setFeedback({ kind: "error", text: error ?? "잘라내지 못했습니다." }); return; }
    onCopy(plan.clipboard);
    setFeedback({ kind: "ok", text: "선택한 구간을 잘라냈습니다. 빈 자리는 그대로 남으며 Undo 한 번으로 되돌릴 수 있습니다." });
  }

  function paste() {
    if (!clipboard) return;
    if (cursorTick === null) {
      setFeedback({ kind: "error", text: "붙여넣을 위치가 없습니다. 입력 위치를 '편집 커서에 입력'으로 바꾸고 커서를 옮겨 주세요." });
      return;
    }
    const plan = planPaste(score, clipboard, { startTick: cursorTick, createId: () => crypto.randomUUID() });
    const error = plan.ok ? onCommand(plan.command) : plan.message;
    if (error !== null) { setFeedback({ kind: "error", text: error }); return; }
    onPasted(cursorTick + clipboard.lengthTicks);
    setFeedback({
      kind: "ok",
      text: `${Math.floor(cursorTick / barTicks) + 1}마디 ${(cursorTick % barTicks) / beatTicks + 1}박에 붙여넣었습니다. Undo 한 번으로 되돌릴 수 있습니다.`,
    });
  }

  return <section aria-label="복사·붙여넣기" style={{ border: "1px solid #d9dee8", borderRadius: 8, padding: 12, marginBottom: 16 }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <button type="button" disabled={!selection} onClick={copy}>구간 복사</button>
      <button type="button" disabled={!selection} onClick={cut}>구간 잘라내기</button>
      <button type="button" disabled={!clipboard} onClick={paste}>커서에 붙여넣기</button>
      <span data-testid="clipboard-status" data-filled={clipboard ? "on" : "off"}
        data-event-count={clipboard?.events.length ?? 0} data-length-ticks={clipboard?.lengthTicks ?? ""}>
        {clipboard
          ? `클립보드: 음표 ${notes}개 · 쉼표 ${clipboard.events.length - notes}개 · ${measures}마디 길이`
          : "클립보드 비어 있음"}
      </span>
    </div>
    {feedback && <p data-testid="clipboard-feedback" data-kind={feedback.kind} aria-live="polite"
      style={{ margin: "8px 0 0", color: feedback.kind === "error" ? "#b91c1c" : "#1c1f26" }}>{feedback.text}</p>}
    <p style={{ fontSize: 12, marginBottom: 0 }}>선택한 구간을 복사하거나 잘라내 편집 커서 위치에 붙여넣습니다. 잘라낸 자리는 비워 두며 뒤 음표를 당기지 않습니다. 붙여넣을 구간 전체가 비어 있어야 하며 기존 음표를 덮어쓰거나 밀어내지 않고 마디를 자동으로 추가하지 않습니다. 클립보드는 이 화면에서만 유지되고 새로고침하면 비워집니다.</p>
  </section>;
}
