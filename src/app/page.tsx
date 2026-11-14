"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listScores, type ScoreSummary } from "@/application";
import { getScoreRepository } from "@/adapters/indexeddb";
import { formatDate } from "@/shared";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "./brand";

const RECENT_COUNT = 3;

const page: React.CSSProperties = {
  maxWidth: 720, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6, wordBreak: "keep-all",
  fontFamily: "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif",
};
const primary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", textDecoration: "none",
  minHeight: 48, padding: "10px 18px", borderRadius: 10, border: "1px solid #1b2a4a", background: "#1b2a4a",
  color: "#ffffff", fontSize: 15, fontWeight: 600, cursor: "pointer",
};
const secondary: React.CSSProperties = { ...primary, background: "#ffffff", color: "#1b2a4a" };
const muted: React.CSSProperties = { fontSize: 13, color: "#5f6773" };

type Recent = { kind: "loading" } | { kind: "ready"; scores: ScoreSummary[] } | { kind: "error" };

/** Entry point (PRD §4): start by humming or piano, reopen a recent score. Everything stays in this browser. */
export default function HomePage() {
  const [recent, setRecent] = useState<Recent>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    listScores(getScoreRepository()).then(
      (scores) => { if (active) setRecent({ kind: "ready", scores: scores.slice(0, RECENT_COUNT) }); },
      () => { if (active) setRecent({ kind: "error" }); },
    );
    return () => { active = false; };
  }, []);

  return (
    <main style={page}>
      <p style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 28px", fontSize: 15, fontWeight: 700, color: "#1b2a4a" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 24px static SVG mark; next/image adds nothing here */}
        <img src="/icon.svg" alt="" width={24} height={24} />
        <span data-testid="brand">{PRODUCT_NAME}</span>
      </p>
      <h1 style={{ fontSize: 30, lineHeight: 1.25, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
        {PRODUCT_TAGLINE}
      </h1>
      <p style={{ fontSize: 16, margin: "0 0 24px", maxWidth: 560 }}>
        허밍을 녹음하거나 화면 피아노로 음을 넣으면 악보가 됩니다. 고치고, 조를 옮기고, 느리게 반복해 연습한 뒤
        PDF·MIDI·MusicXML로 내보낼 수 있습니다. 로그인은 필요 없습니다.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <Link href="/record" style={primary}>허밍으로 시작</Link>
        <Link href="/new" style={secondary}>피아노로 시작</Link>
      </div>
      <p style={muted}>허밍은 마이크 동의 후에만 녹음하며, 녹음은 이 기기 안에서 분석하고 저장하거나 보내지 않습니다.</p>

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
        권장 환경: 최신 Chrome·Safari(컴퓨터·휴대폰). 허밍 녹음은 마이크와 AudioWorklet을 지원하는 브라우저에서만 됩니다.
      </p>
      <p style={muted}>
        악보는 이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 악보도 사라지니, 중요한 악보는 악보함에서 JSON으로 백업해 두세요.
      </p>
      <nav aria-label="사이트 정보" style={{ ...muted, display: "flex", gap: 16, marginTop: 24 }}>
        <Link href="/licenses" style={{ color: "#5f6773" }}>오픈소스 라이선스</Link>
      </nav>
    </main>
  );
}
