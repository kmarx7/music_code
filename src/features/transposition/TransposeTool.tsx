"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { EditSessionState } from "@/application/edit-session";
import { KEY_SIGNATURE_OPTIONS, isSupportedKeySignature, type TransposeDirection } from "@/domain/music-theory";
import { transposeScore, type TransposeSpec } from "@/domain/score";
import { scoreStore } from "@/store/score-store";
import { useScoreState } from "@/store/useScoreStore";
import { StaffView } from "@/features/score-editor";
import type { AutosaveHandle, SaveStatus } from "@/features/score-library";

const button = { padding: "8px 14px", minHeight: 44, border: "1px solid #c8cfdb", borderRadius: 8, background: "#fff", cursor: "pointer" };
const blocked = (status: SaveStatus) => status === "conflict" || status === "deleted" || status === "error";
function explain(error: { code: string }): string {
  switch (error.code) {
    case "MIDI_OUT_OF_RANGE": return "일부 음이 지원 음역(MIDI 0~127)을 벗어납니다. 다른 조성이나 방향을 선택해 주세요.";
    case "PITCH_NOT_REPRESENTABLE": return "일부 음이 지원하는 옥타브 또는 겹임시표 범위를 벗어납니다. 다른 조성이나 방향을 선택해 주세요.";
    case "UNSUPPORTED_KEY_SIGNATURE": return "현재 악보 또는 선택한 목표 조성을 지원하지 않습니다.";
    case "MODE_CHANGE_NOT_SUPPORTED": return "장조와 단조 사이의 변환은 지원하지 않습니다.";
    case "INVALID_SCORE": case "INVALID_PITCH": return "원본 악보를 안전하게 조옮길 수 없습니다. 악보 내용을 확인해 주세요.";
    default: return "조옮김 설정이 올바르지 않습니다. 목표 조성과 방향을 확인해 주세요.";
  }
}

/** Transient candidate only. Confirmation alone uses the existing synchronous command pipeline. */
export function TransposeTool({ autosave, status, onOpen }: {
  autosave: RefObject<AutosaveHandle | null>; status: SaveStatus; onOpen?: () => void;
}) {
  const session = useScoreState();
  const [base, setBase] = useState<{ session: EditSessionState; revision: number } | null>(null);
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<TransposeDirection>("nearest");
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { if (base) panel.current?.focus(); }, [base]);
  const selection = KEY_SIGNATURE_OPTIONS.find((option) => option.id === target);
  const spec = useMemo<TransposeSpec | null>(() => selection
    ? { kind: "targetKey", targetKey: selection.key, direction } : null, [selection, direction]);
  const candidate = useMemo(() => base && spec ? transposeScore(base.session.current, spec) : null, [base, spec]);
  const snapshot = autosave.current?.getSnapshot?.();
  const stale = !!base && (session !== base.session || !snapshot || snapshot.revision !== base.revision);
  const unavailable = blocked(status) || (snapshot ? blocked(snapshot.status) : true);
  const sourceKey = base?.session.current.parts[0].keySignature;
  const sourceOption = KEY_SIGNATURE_OPTIONS.find((option) => sourceKey && isSupportedKeySignature(sourceKey) &&
    option.id === `${sourceKey.mode}:${sourceKey.fifths}`);

  function close() { setBase(null); setError(""); trigger.current?.focus(); }
  function open() {
    if (base) { panel.current?.focus(); return; }
    const current = scoreStore.getState(); const state = autosave.current?.getSnapshot?.();
    if (!current || !state) { setError("저장 상태를 준비 중입니다. 잠시 후 다시 시도해 주세요."); return; }
    const key = current.current.parts[0].keySignature;
    submitted.current = false; setError(""); setTarget(`${key.mode}:${key.fifths}`); setDirection("nearest");
    setBase({ session: current, revision: state.revision }); onOpen?.();
  }
  function confirm() {
    if (submitted.current) return;
    // No await between these reads and dispatch. React props can lag behind the synchronous owners.
    const current = scoreStore.getState(); const state = autosave.current?.getSnapshot?.();
    if (!base || current !== base.session || !state || state.revision !== base.revision) {
      setError("원본 또는 저장 버전이 변경되었습니다. 취소한 뒤 다시 미리보기를 열어 주세요."); return;
    }
    if (blocked(status) || blocked(state.status)) { setError("저장 충돌·삭제 또는 오류 상태입니다. 먼저 저장 상태를 확인해 주세요."); return; }
    if (!candidate?.ok || !spec) { setError("유효한 미리보기를 먼저 선택해 주세요."); return; }
    submitted.current = true;
    const result = scoreStore.dispatch({ type: "TransposeScore", spec, updatedAt: new Date().toISOString() });
    if (result?.ok) close();
    else {
      submitted.current = false;
      setError(result ? explain(result.error) : "조옮김을 적용하지 못했습니다. 원본 악보는 변경하지 않았습니다.");
    }
  }
  return <div style={{ marginBottom: 16 }}>
    <button ref={trigger} type="button" style={button} aria-expanded={!!base} disabled={!session || status === "conflict" || status === "deleted"} onClick={open}>조옮김</button>
    {!base && error ? <p aria-live="polite">{error}</p> : null}
    {base && <section ref={panel} tabIndex={-1} role="region" aria-label="조옮김 미리보기" data-testid="transpose-preview"
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
      style={{ marginTop: 12, padding: 16, border: "1px solid #d9dee8", borderRadius: 10, background: "#fff", minWidth: 0 }}>
      <h2 style={{ fontSize: 18 }}>조옮김 미리보기</h2>
      <p>현재 조성: {sourceOption?.label ?? "지원하지 않는 조성"}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <label>목표 조성 <select style={{ minHeight: 44, maxWidth: "100%" }} aria-label="조옮김 목표 조성" value={target} onChange={(event) => { setTarget(event.target.value); setError(""); }}>
          {KEY_SIGNATURE_OPTIONS.filter((option) => option.key.mode === sourceKey?.mode).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select></label>
        <label>이동 방향 <select style={{ minHeight: 44, maxWidth: "100%" }} aria-label="조옮김 이동 방향" value={direction} onChange={(event) => { setDirection(event.target.value as TransposeDirection); setError(""); }}>
          <option value="nearest">가까운 방향</option><option value="up">상행</option><option value="down">하행</option>
        </select></label>
      </div>
      {stale ? <p role="alert">원본 또는 저장 버전이 변경되었습니다. 취소한 뒤 다시 미리보기를 열어 주세요.</p>
        : unavailable ? <p role="alert">저장 충돌·삭제 또는 오류 상태에서는 확정할 수 없습니다. 저장 상태를 확인해 주세요.</p> : null}
      {candidate?.ok ? <>
        <p data-testid="transpose-movement">{sourceOption?.label} → {selection?.label} · {candidate.value.interval.deltaSemitones > 0 ? "+" : ""}{candidate.value.interval.deltaSemitones}반음
          {candidate.value.interval.deltaSemitones > 0 ? " 상행" : candidate.value.interval.deltaSemitones < 0 ? " 하행" : " 이동"} · {stale || unavailable ? "확정 불가" : "조옮김 가능"}</p>
        {candidate.value.score === base.session.current ? <p>현재 악보와 같은 결과입니다. 확정해도 편집 이력은 추가되지 않습니다.</p> : null}
        <div data-testid="transpose-candidate"><StaffView score={candidate.value.score} /></div>
        {candidate.value.score.parts.length > 1 ? <p>모든 파트가 조옮겨집니다. 미리보기는 첫 파트를 표시합니다.</p> : null}
      </> : candidate ? <p role="alert" data-error-code={candidate.error.code}>{explain(candidate.error)}</p>
        : <p role="alert">지원하는 목표 조성을 선택해 주세요.</p>}
      <p>미리보기는 저장되지 않으며 소리를 재생하지 않습니다.</p>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" style={button} disabled={!candidate?.ok || stale || unavailable} onClick={confirm}>확정</button>{" "}
      <button type="button" style={button} onClick={close}>취소</button>
    </section>}
  </div>;
}
