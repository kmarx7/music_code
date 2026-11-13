import type { Metadata } from "next";

export const metadata: Metadata = { title: "악보함" };

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
