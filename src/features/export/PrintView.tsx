"use client";

import { useEffect, useRef, useState } from "react";
import { exportFileName } from "@/application";
import { KEY_SIGNATURE_OPTIONS, type NoteLabelMode } from "@/domain/music-theory";
import type { Score } from "@/domain/score/types";
import { NotationRenderError } from "@/adapters/vexflow/renderScore";
import { renderPrintRows } from "@/adapters/vexflow/printRows";

const PRINT_CSS = `
@page { size: A4 portrait; margin: 16mm 14mm 18mm;
  @bottom-center { content: counter(page) " / " counter(pages); font: 9pt system-ui, sans-serif; color: #5f6773; } }
.print-page { max-width: 760px; margin: 0 auto; padding: 24px 16px; background: #ffffff; color: #1c1f26;
  font-family: system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif; }
.print-row { break-inside: avoid; page-break-inside: avoid; margin: 0 0 4px; }
.print-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 16px; padding: 12px;
  border: 1px solid #d9dee8; border-radius: 10px; background: #f6f7fb; }
@media print {
  html, body { background: #ffffff !important; }
  .print-page { max-width: none; padding: 0; }
  .no-print { display: none !important; }
}
`;

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; score: Score };

export interface PrintViewProps {
  /** Reads the stored score (never creates or saves one). */
  load: () => Promise<Score | null>;
  labelMode: NoteLabelMode;
}

function keyLabel(score: Score): string {
  const key = score.parts[0]?.keySignature;
  return KEY_SIGNATURE_OPTIONS.find((option) => option.key.fifths === key?.fifths && option.key.mode === key?.mode)?.label ?? "";
}

/** Read-only A4 print layout of the stored score (P5-06). Nothing here writes to storage, history or the Score. */
export function PrintView({ load, labelMode }: PrintViewProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const host = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    load().then((score) => {
      if (!active) return;
      if (!score) { setState({ kind: "error", message: "저장된 악보를 찾을 수 없습니다. 편집 화면에서 저장한 뒤 다시 여세요." }); return; }
      setState({ kind: "ready", score });
    }, (error: unknown) => {
      if (active) setState({ kind: "error", message: `악보를 읽지 못했습니다. ${error instanceof Error ? error.message : ""}`.trim() });
    });
    return () => { active = false; };
  }, [load]);

  const [drawn, setDrawn] = useState<{ score: Score; count: number } | null>(null);
  const score = state.kind === "ready" ? state.score : null;
  useEffect(() => {
    if (!score || !host.current || !rows.current) return;
    let active = true;
    const target = rows.current;
    document.title = exportFileName(score.title, "pdf").replace(/\.pdf$/, "");
    renderPrintRows(host.current, score, labelMode).then((svgs) => {
      if (!active) return;
      target.replaceChildren(...svgs.map((svg) => {
        const row = document.createElement("div");
        row.className = "print-row";
        row.appendChild(svg);
        return row;
      }));
      host.current?.replaceChildren();
      setDrawn({ score, count: svgs.length });
    }, (error: unknown) => {
      if (!active) return;
      setState({ kind: "error", message: error instanceof NotationRenderError
        ? `정확한 기보를 인쇄할 수 없습니다. ${error.message}` : "악보를 인쇄용으로 그리지 못했습니다. 원본 악보는 바뀌지 않았습니다." });
    });
    return () => { active = false; };
  }, [score, labelMode]);

  const ready = state.kind === "ready" && drawn?.score === state.score;
  const part = score?.parts[0];
  const otherParts = score ? score.parts.length - 1 : 0;
  return (
    <main className="print-page" data-testid="print-view" data-state={state.kind === "error" ? "error" : ready ? "ready" : "loading"}
      data-rows={ready ? drawn.count : undefined}>
      <style>{PRINT_CSS}</style>
      <div className="print-toolbar no-print">
        <button type="button" disabled={!ready} onClick={() => window.print()}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #1b2a4a", background: "#1b2a4a", color: "#ffffff", minHeight: 44, cursor: "pointer" }}>
          인쇄 / PDF로 저장
        </button>
        <span style={{ fontSize: 12, color: "#5f6773" }}>A4 세로. 인쇄 대화상자에서 대상을 &quot;PDF로 저장&quot;으로 고르세요. 저장된 내용으로 인쇄합니다.</span>
        {otherParts > 0 ? <p role="status" style={{ width: "100%", margin: 0, fontSize: 12 }}>
          다른 파트 {otherParts}개는 인쇄에 포함되지 않습니다. MIDI·MusicXML에는 모든 파트가 들어갑니다.
        </p> : null}
      </div>
      {state.kind === "error" ? <p role="alert" data-testid="print-error">{state.message}</p> : null}
      {state.kind === "loading" || (state.kind === "ready" && !ready) ? <p className="no-print">인쇄 화면 준비 중…</p> : null}
      {score && part && state.kind !== "error" ? <header style={{ marginBottom: 12 }}>
        <h1 data-testid="print-title" style={{ fontSize: 22, margin: "0 0 4px", overflowWrap: "anywhere" }}>{score.title}</h1>
        <p data-testid="print-meta" style={{ margin: 0, fontSize: 12, color: "#3f4652" }}>
          ♩ = {score.tempoBpm} · {part.timeSignature.numerator}/{part.timeSignature.denominator}박자 · {keyLabel(score)} · 마디 {part.measures.length}개
        </p>
      </header> : null}
      <div ref={rows} data-testid="print-rows" hidden={state.kind === "error"} />
      <div ref={host} aria-hidden="true" style={{ position: "absolute", left: -20000, top: 0, width: 1200 }} />
    </main>
  );
}
