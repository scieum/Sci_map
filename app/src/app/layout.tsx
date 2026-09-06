import type { Metadata, Viewport } from "next";
import "./globals.css";
import TabBar from "@/components/TabBar";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 소프트 키보드가 올라오면 레이아웃 뷰포트가 그만큼 줄어든다. 기본값은
  // 키보드가 화면을 덮기만 해서, 바닥에 붙은 입력창을 브라우저가 스크롤로
  // 끌어올리며 문항을 위로 밀어냈다 (단답형 치명 버그, 2026-09-06).
  interactiveWidget: "resizes-content",
  themeColor: "#4b5be8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* 서체는 globals.css 의 @font-face 가 물린다. 여기서는 그 호스트에
            미리 붙어 첫 글자가 뜨는 시각을 앞당기는 일만 한다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-ink">
        {children}
        <TabBar />
      </body>
    </html>
  );
}
