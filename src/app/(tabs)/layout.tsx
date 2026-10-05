import { TabBar } from "@/components/tab-bar";
import { OnboardingGate } from "@/components/onboarding-gate";
import { CheerBanner } from "@/components/cheer-banner";
import { LaunchMotivationSplash } from "@/components/launch-motivation-splash";
import { TabBackdrop } from "@/components/tab-backdrop";
import { CrewBanner } from "@/components/feed/crew-banner";

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
        ⚠️⚠️ `main`에 위치·층(relative·isolate·z-*)을 주지 마라 (2026-10-05 아이폰 실측).
        8d24301이 배경 사진을 내용 뒤에 깔려고 `relative isolate z-50`을 줬더니, 아이폰
        Safari에서 그 안의 `fixed` 시트(운동 고르기)가 **이 스크롤 영역 경계에서 잘려**
        하단 바 `운동 N개 바로 추가`가 탭바 뒤로 사라졌다. 크롬·윈도 WebKit에서는 재현되지
        않는다 — 데스크톱 확인으로 통과했다고 믿지 마라.

        그래서 `main`은 오늘 이전 그대로 두고, 사진과 내용은 **안쪽 상자에서 순서로만**
        겹친다: 바깥 `relative`(층을 만들지 않음) → 사진(absolute, z 없음) → 내용
        (`relative`, z 없음). 둘 다 z가 없으니 문서 순서대로 그려져 내용이 사진 위에 오고,
        시트·운동 중 화면의 z-20~50은 문서 최상위 층에서 탭바를 덮는다(오늘 이전과 같다).
      */}
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        <div className="relative">
          <TabBackdrop />
          <div className="relative">{children}</div>
        </div>
      </main>
      {/* 피드 하단 고정 배너 (2026-10-05) — 스크롤 영역 밖, 탭바 바로 위. 피드에서만 그린다.
          ⚠️ 위치·층을 주지 않는 흐름 요소다(위 `main` 주석과 같은 이유). */}
      <CrewBanner />
      <TabBar />
    </>
  );
}
