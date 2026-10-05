import { TabBar } from "@/components/tab-bar";
import { OnboardingGate } from "@/components/onboarding-gate";
import { CheerBanner } from "@/components/cheer-banner";
import { LaunchMotivationSplash } from "@/components/launch-motivation-splash";
import { TabBackdrop } from "@/components/tab-backdrop";

export default function TabsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <LaunchMotivationSplash />
      <OnboardingGate />
      <CheerBanner />
      {/*
        relative isolate — 첫 화면 배경 사진(TabBackdrop, -z-10)이 내용 뒤에 깔리게 (2026-10-05).
        ⚠️ z-50이 함께 있어야 한다. isolate만 주면 main이 0번 층이 되어, 그 안에서 뜨는
           운동 추가 시트·운동 중 화면(z-20~50)이 뒤에 오는 하단 탭에 덮였다(2026-10-05 실측).
           50은 그 창들의 원래 최고 층과 같고, 응원 배너(60)·실행 화면(100)보다는 낮다.
      */}
      <main className="relative isolate z-50 flex-1 overflow-y-auto px-4 pt-4 pb-6">
        <TabBackdrop />
        {children}
      </main>
      <TabBar />
    </>
  );
}
