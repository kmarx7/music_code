import type { Metadata } from "next";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_TAGLINE } from "./brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`, template: `%s · ${PRODUCT_NAME}` },
  description: PRODUCT_DESCRIPTION,
  applicationName: PRODUCT_NAME,
  openGraph: {
    type: "website", locale: "ko_KR", siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`, description: PRODUCT_DESCRIPTION,
  },
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
