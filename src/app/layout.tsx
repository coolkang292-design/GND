import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { AcquisitionTracker } from "@/components/acquisition-tracker";
import { FunnelTracker } from "@/components/funnel-tracker";
import { TrailTracker } from "@/components/trail-tracker";
import { InstallGate } from "@/components/install/install-gate";
import {
  DEFAULT_SHARE,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from "@/lib/domain/share-meta";
import { siteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  // ⚠️⚠️ **`metadataBase`를 지우지 마라** (2026-09-20). 이게 없으면 아래
  //    `images`의 상대 경로가 절대 URL로 안 바뀌고, 카카오톡이 `og:image`를
  //    못 가져와 **태그는 있는데 그림만 없는** 카드가 된다.
  metadataBase: new URL(siteUrl()),
  title: "GND",
  description: "친구 운동 챌린지 — GND 탈출하자",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GND",
  },
  // ⚠️ 카카오톡은 **`og:*`만 읽는다.** 위 `description`(= `<meta name=...>`)은
  //    안 본다 — 그게 있는데도 카카오 기본 문구 "여기를 눌러 링크를 확인하세요"가
  //    떴던 이유다(2026-09-20 운영 실측). 문구는 `domain/share-meta.ts`가 한곳에서
  //    정하고, 초대 링크(`/c/[code]`·`/invite/[code]`)가 각자 덮어쓴다.
  openGraph: {
    type: "website",
    siteName: "GND",
    locale: "ko_KR",
    title: DEFAULT_SHARE.title,
    description: DEFAULT_SHARE.description,
    images: [
      {
        url: DEFAULT_SHARE.image,
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        alt: "GND — 친구 운동 챌린지",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_SHARE.title,
    description: DEFAULT_SHARE.description,
    images: [DEFAULT_SHARE.image],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0B0C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: 카카오톡 등 인앱 브라우저가 로드 시
    // html/body 속성을 주입해 생기는 하이드레이션 경고 무시 (1단계 속성만)
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex justify-center" suppressHydrationWarning>
        <ServiceWorkerRegister />
        <TrailTracker />
        <AcquisitionTracker />
        <AuthProvider>
          {/* ⚠️ AuthProvider **안**이다 — 익명 계정을 여기서 발급하므로
              밖에 두면 userId가 영원히 null이라 유입이 한 건도 안 잡힌다. */}
          <FunnelTracker />
          <div className="w-full max-w-[430px] h-dvh flex flex-col relative bg-bg">
            {children}
            {/* ⚠️ `(tabs)` 안이 아니라 **여기**다 — 카톡 인앱 탈출 안내가
                `/login`·`/onboarding`보다 먼저 떠야 하는데 그 둘은 탭 밖이다. */}
            <InstallGate />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
