import type { Metadata } from "next";
import Link from "next/link";
import { COMPONENTS, type Component } from "./components";
import { APACHE_2_0, GONVILLE_LICENCE, MIT_TERMS, OFL_1_1, ZERO_BSD_TSLIB } from "./texts";

export const metadata: Metadata = { title: "오픈소스 라이선스" };

const TEXTS: { id: string; title: string; text: string }[] = [
  { id: "mit", title: "MIT License (아래 각 저작권 표시와 함께 적용)", text: MIT_TERMS },
  { id: "apache", title: "Apache License 2.0 (@swc/helpers)", text: APACHE_2_0 },
  { id: "0bsd", title: "0BSD (tslib)", text: ZERO_BSD_TSLIB },
  { id: "ofl", title: "SIL Open Font License 1.1 (Bravura, Academico, Petaluma, Petaluma Script)", text: OFL_1_1 },
  { id: "gonville", title: "Gonville LICENCE", text: GONVILLE_LICENCE },
];
const anchor: Record<Component["license"], string> = { "MIT": "mit", "Apache-2.0": "apache", "0BSD": "0bsd", "OFL-1.1": "ofl", "Gonville": "gonville" };

const page: React.CSSProperties = { maxWidth: 820, margin: "0 auto", padding: "40px 24px", lineHeight: 1.6, wordBreak: "keep-all",
  fontFamily: "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif" };
const cell: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid #e3e7ef", verticalAlign: "top", textAlign: "left" };

export default function LicensesPage() {
  return (
    <main style={page}>
      <p><Link href="/">← 홈</Link></p>
      <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>오픈소스 라이선스</h1>
      <p style={{ color: "#3f4652" }}>이 앱은 아래 오픈소스 소프트웨어와 글꼴을 브라우저에서 사용합니다. 각 구성 요소의 저작권은 해당 저작자에게 있습니다.</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead><tr><th style={cell}>구성 요소</th><th style={cell}>버전</th><th style={cell}>라이선스</th><th style={cell}>저작권</th><th style={cell}>쓰임</th></tr></thead>
          <tbody>
            {COMPONENTS.map((component) => (
              <tr key={component.name}>
                <td style={cell}>{component.name}</td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{component.version}</td>
                <td style={cell}><a href={`#${anchor[component.license]}`}>{component.license}</a></td>
                <td style={cell}>{component.copyright}</td>
                <td style={cell}>{component.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {TEXTS.map((entry) => (
        <section key={entry.id} id={entry.id} style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18 }}>{entry.title}</h2>
          <pre tabIndex={0} aria-label={`${entry.title} 전문`} style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#ffffff", border: "1px solid #d9dee8", borderRadius: 8, padding: 12, maxHeight: 360, overflow: "auto" }}>{entry.text}</pre>
        </section>
      ))}
    </main>
  );
}
