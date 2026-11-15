"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createNewScore } from "@/application";
import { getScoreRepository } from "@/adapters/indexeddb";
import { parseScoreSetup, ScoreSetupFields } from "@/features/score-setup";

/**
 * Piano start (Phase 7 decision 3): one setup step, then the editor in input mode. Nothing is saved until "만들기";
 * leaving this page creates nothing. One press makes exactly one score, even on a double click.
 */
export default function NewScorePage() {
  const router = useRouter();
  const pending = useRef(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<{ text: string; fallback?: string } | null>(null);

  async function submit(form: HTMLFormElement) {
    if (pending.current) return;
    const data = new FormData(form);
    const parsed = parseScoreSetup({ title: data.get("title"), meter: data.get("meter"), tempo: data.get("tempo"), key: data.get("key"), instrument: data.get("instrument") });
    if (!parsed.ok) { setError({ text: parsed.message }); return; }
    pending.current = true; setCreating(true); setError(null);
    const id = crypto.randomUUID();
    try {
      await createNewScore(getScoreRepository(), { id, createdAt: new Date().toISOString(), ...parsed.setup });
      router.push(`/editor/${id}?start=piano`);
    } catch {
      pending.current = false; setCreating(false);
      // Storage refused (P6-05): the editor still works in memory with a clear "not saved" notice.
      setError({ text: "이 브라우저에 악보를 저장할 수 없습니다(사생활 보호 모드 또는 사이트 데이터 차단). 저장 없이 편집은 할 수 있으며, 내용은 JSON 백업으로 보관해야 합니다.",
        fallback: `/editor/${crypto.randomUUID()}?start=piano` });
    }
  }

  return (
    <main className="hb-narrow">
      <Link href="/" className="hb-link">← 홈</Link>
      <h1 className="hb-title" style={{ marginTop: 16 }}>피아노로 새 악보</h1>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
        <ScoreSetupFields />
        {error ? <p role="alert" className="hb-alert">
          {error.text} {error.fallback ? <Link href={error.fallback}>저장 없이 편집기 열기</Link> : null}
        </p> : null}
        <div className="hb-actions">
          <span className="hb-muted">악보는 이 브라우저에만 저장됩니다.</span>
          <button type="submit" className="hb-btn hb-btn-primary" disabled={creating}>만들기</button>
        </div>
      </form>
    </main>
  );
}
