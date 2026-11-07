import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Music Score Platform",
  description: "Local-first monophonic humming and piano score MVP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
