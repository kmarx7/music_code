import type { Metadata } from "next";

export const metadata: Metadata = { title: "허밍으로 시작" };

export default function RecordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
