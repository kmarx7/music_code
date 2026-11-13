"use client";

/** Last-resort boundary when the root layout itself fails (P6-05). It must render its own html/body. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif", background: "#f6f7fb", color: "#1c1f26" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6 }}>
          <h1 style={{ fontSize: 24 }}>앱을 불러오지 못했습니다</h1>
          <p>저장된 악보는 이 브라우저에 그대로 있습니다. 다시 시도하거나 페이지를 새로 고쳐 주세요.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: "8px 14px", borderRadius: 8 }}>다시 시도</button>
        </main>
      </body>
    </html>
  );
}
