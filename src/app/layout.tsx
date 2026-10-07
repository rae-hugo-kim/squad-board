import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "호발동", template: "%s · 호발동" },
  description: "발로란트 소모임 전술 보드 · 멤버 선호 · 스쿼드 편성",
};

/**
 * 루트 레이아웃. 폰트는 globals.css에서 npm 패키지로 로드하므로 여기선 lang과
 * 기본 배경만 책임진다. 네비게이션은 로그인 여부에 따라 달라서 (app)/layout에 둔다.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-base text-primary antialiased">{children}</body>
    </html>
  );
}
