import Link from "next/link";
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
      <h1 style={{ fontSize: 22 }}>Music Score Platform</h1>
      <p>
        단선율 허밍·가상 피아노 입력을 악보로 만들고, 편집·재생·저장·내보내기까지
        연결하는 로컬 우선 MVP입니다. 현재는 Phase 1 편집 화면까지 구현했습니다.
      </p>
      <p>
        <Link
          href="/editor/demo-score"
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: 8,
            background: "#1b2a4a",
            color: "#ffffff",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          편집기 열기
        </Link>
      </p>
      <ul style={{ fontSize: 13, color: "#5f6773" }}>
        <li>Canonical Score schema v{SCORE_SCHEMA_VERSION}</li>
        <li>{TICKS_PER_QUARTER} ticks per quarter note</li>
      </ul>
    </main>
  );
}
