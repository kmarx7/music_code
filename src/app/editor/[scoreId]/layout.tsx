import type { Metadata } from "next";

export const metadata: Metadata = { title: "편집기" };

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
