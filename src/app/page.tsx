"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createNewScore, listScores, type ScoreSummary } from "@/application";
import { getScoreRepository } from "@/adapters/indexeddb";
import { formatDate } from "@/shared";

const RECENT_COUNT = 3;

const page: React.CSSProperties = {
  maxWidth: 720, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6, wordBreak: "keep-all",
  fontFamily: "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif",
};
const primary: React.CSSProperties = {
  minHeight: 48, padding: "10px 18px", borderRadius: 10, border: "1px solid #1b2a4a", background: "#1b2a4a",
  color: "#ffffff", fontSize: 15, fontWeight: 600, cursor: "pointer",
};
const secondary: React.CSSProperties = { ...primary, background: "#ffffff", color: "#1b2a4a" };
const muted: React.CSSProperties = { fontSize: 13, color: "#5f6773" };

type Recent = { kind: "loading" } | { kind: "ready"; scores: ScoreSummary[] } | { kind: "error" };

/** Entry point (PRD §4): start by humming or piano, reopen a recent score. Everything stays in this browser. */
export default function HomePage() {
  const router = useRouter();
  const [recent, setRecent] = useState<Recent>({ kind: "loading" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    listScores(getScoreRepository()).then(
      (scores) => { if (active) setRecent({ kind: "ready", scores: scores.slice(0, RECENT_COUNT) }); },
      () => { if (active) setRecent({ kind: "error" }); },
    );
    return () => { active = false; };
  }, []);

  async function start(mode: "hum" | "piano") {
    // One score per intent, even on a double click.
    if (pending.current) return;
    pending.current = true; setCreating(true); setError("");
    try {
      const id = crypto.randomUUID();
      await createNewScore(getScoreRepository(), { id, createdAt: new Date().toISOString() });
      router.push(`/editor/${id}?start=${mode}`);
    } catch {
      pending.current = false; setCreating(false);
      setError("새 악보를 만들지 못했습니다. 브라우저가 사이트 데이터 저장을 막고 있지 않은지 확인해 주세요.");
    }
  }

  return (
    <main style={page}>
      <h1 style={{ fontSize: 30, lineHeight: 1.25, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
        흥얼거린 멜로디를 악보로
      </h1>
      <p style={{ fontSize: 16, margin: "0 0 24px", maxWidth: 560 }}>
        허밍을 녹음하거나 화면 피아노로 음을 넣으면 악보가 됩니다. 고치고, 조를 옮기고, 느리게 반복해 연습한 뒤
        PDF·MIDI·MusicXML로 내보낼 수 있습니다. 로그인은 필요 없습니다.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <button type="button" style={primary} disabled={creating} onClick={() => void start("hum")}>허밍으로 시작</button>
        <button type="button" style={secondary} disabled={creating} onClick={() => void start("piano")}>피아노로 시작</button>
      </div>
      <p style={muted}>허밍은 마이크 동의 후에만 녹음하며, 녹음은 이 기기 안에서 분석하고 저장하거나 보내지 않습니다.</p>
      {error ? <p role="alert" style={{ color: "#b91c1c", fontSize: 14 }}>{error}</p> : null}

      <section aria-labelledby="recent-heading" data-testid="home-recent" style={{ marginTop: 40 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 id="recent-heading" style={{ fontSize: 17, margin: 0 }}>최근 악보</h2>
          <Link href="/library" style={{ fontSize: 14, color: "#1b2a4a" }}>모든 악보 보기 · JSON 가져오기 →</Link>
        </div>
        {recent.kind === "loading" ? <p style={muted}>불러오는 중…</p> : null}
        {recent.kind === "error" ? <p role="alert" style={{ ...muted, color: "#b91c1c" }}>최근 악보를 불러오지 못했습니다. 악보함에서 다시 시도해 주세요.</p> : null}
        {recent.kind === "ready" && recent.scores.length === 0 ? <p style={muted}>아직 만든 악보가 없습니다. 위에서 시작해 보세요.</p> : null}
        {recent.kind === "ready" && recent.scores.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", borderTop: "1px solid #e3e7ef" }}>
            {recent.scores.map((score) => (
              <li key={score.id} style={{ borderBottom: "1px solid #e3e7ef" }}>
                <Link href={`/editor/${encodeURIComponent(score.id)}`}
                  style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 4px", minHeight: 44, color: "#1c1f26", textDecoration: "none" }}>
                  <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{score.title}</span>
                  <span style={{ ...muted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatDate(score.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p style={{ ...muted, marginTop: 40 }}>
        악보는 이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 악보도 사라지니, 중요한 악보는 악보함에서 JSON으로 백업해 두세요.
      </p>
    </main>
  );
}
