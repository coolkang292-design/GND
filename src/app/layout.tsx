import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export const metadata: Metadata = {
  title: "GND",
  description: "친구 운동 챌린지 — GND 탈출하자",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GND",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F8F7" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1615" },
  ],
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
        <AuthProvider>
          <div className="w-full max-w-[430px] h-dvh flex flex-col relative bg-bg">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
