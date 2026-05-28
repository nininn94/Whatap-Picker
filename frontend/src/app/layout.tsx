import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "../index.css";

export const metadata: Metadata = {
  title: "Whatap Picker",
  description: "Whatap event prize picker",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
