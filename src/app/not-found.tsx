import Link from "next/link";

export default function NotFound() {
  return (
    <main data-testid="not-found" style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6,
      fontFamily: "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>페이지를 찾을 수 없습니다</h1>
      <p>주소가 바뀌었거나 잘못 입력되었을 수 있습니다. 악보는 이 브라우저의 악보함에 있습니다.</p>
      <p style={{ display: "flex", gap: 16 }}><Link href="/">홈</Link><Link href="/library">악보함</Link></p>
    </main>
  );
}
