"use client";

import { useEffect, useState } from "react";

type State = "unknown" | "unsupported" | "persisted" | "best-effort" | "denied";

/**
 * Asks the browser not to evict this site's storage (P6-05, D-04 #6). Only on the user's click; some browsers
 * decide silently and may say no. It does not replace JSON backups.
 */
export function StoragePersistence() {
  const [state, setState] = useState<State>("unknown");
  useEffect(() => {
    let active = true;
    (async (): Promise<State> => {
      const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
      if (!storage?.persisted || !storage.persist) return "unsupported";
      try { return (await storage.persisted()) ? "persisted" : "best-effort"; } catch { return "unsupported"; }
    })().then((next) => { if (active) setState(next); });
    return () => { active = false; };
  }, []);
  async function request() {
    try { setState((await navigator.storage.persist()) ? "persisted" : "denied"); } catch { setState("denied"); }
  }
  const text = state === "persisted" ? "이 브라우저가 악보 저장 공간을 보호하고 있습니다(공간이 부족해도 자동으로 지우지 않음)."
    : state === "denied" ? "브라우저가 보호 요청을 받아들이지 않았습니다. 중요한 악보는 JSON으로 백업해 주세요."
    : state === "unsupported" ? "이 브라우저는 저장 공간 보호 요청을 지원하지 않습니다. 중요한 악보는 JSON으로 백업해 주세요."
    : state === "best-effort" ? "저장 공간이 부족하면 브라우저가 악보를 지울 수 있습니다." : "";
  return (
    <div data-testid="storage-persistence" data-state={state} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12, color: "#5f6773" }}>
      {/* Polite live text, not a second role="status": the library already owns the page's status message. */}
      <span data-testid="storage-persistence-text" aria-live="polite">{text}</span>
      {state === "best-effort" ? <button type="button" onClick={() => void request()}
        style={{ minHeight: 44, padding: "6px 12px", borderRadius: 8, border: "1px solid #c8cfdb", background: "#fff", cursor: "pointer" }}>저장 공간 보호 요청</button> : null}
    </div>
  );
}
