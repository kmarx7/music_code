import { SCORE_SCHEMA_VERSION, TICKS_PER_QUARTER } from "@/domain/score";

export default function Page() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 32,
        fontFamily:
          "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: 22 }}>Music Score Platform — Phase 0</h1>
      <p>
        구조 설계와 자동 검증 기반만 준비된 상태입니다. 제품 기능(피아노, 채보,
        렌더링, 재생 등)은 Phase 1부터 구현합니다.
      </p>
      <ul>
        <li>Canonical Score schema v{SCORE_SCHEMA_VERSION}</li>
        <li>{TICKS_PER_QUARTER} ticks per quarter note</li>
      </ul>
    </main>
  );
}
