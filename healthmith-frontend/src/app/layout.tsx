import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "헬스미스",
  description: "작은 움직임을 빛나는 보석으로. 나에게 맞춘 5단계 운동 여정, 헬스미스.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
