"use client";

import { useSyncExternalStore } from "react";

import {
  detectInstallEnv,
  isStandaloneDisplay,
  type InstallEnv,
} from "@/lib/domain/install-prompt";

import { OPEN_INSTALL_GUIDE_EVENT } from "./install-gate";

/**
 * 내 정보 탭의 **상시 진입점** — "홈 화면에 앱 설치".
 *
 * ⚠️⚠️ **왜 필요한가**: 자동 안내는 한 번 닫으면 유예가 걸리고, "다 했어요"를
 *    누르면 **영영 안 뜬다.** 실제로 사장님이 그 상태에 갇혔다(2026-08-22 —
 *    카톡에서는 뜨는데 사파리에서는 안 뜸). 자동 안내에는 반드시 **되돌아올
 *    문**이 있어야 한다. 여기가 그 문이고, 닫기 이력을 보지 않는다.
 *
 * ⚠️ 시트를 여는 동작은 여기 없다 — 신호만 보낸다(`OPEN_INSTALL_GUIDE_EVENT`).
 *    안드로이드 `prompt()`·주소 복사·크롬 인텐트가 두 벌로 갈리면 반드시 어긋난다.
 */
export function InstallAppRow() {
  /**
   * ⚠️ `useEffect` + `setState`가 아니다 — `react-hooks/set-state-in-effect`에
   *    걸리고, 초기값을 `window`에서 읽으면 서버가 그린 것과 달라져 하이드레이션이
   *    깨진다. `useSyncExternalStore`가 정확히 이 경우를 위한 것이다
   *    (`app/login/page.tsx`도 같은 방식). 값이 바뀌지 않으므로 구독은 빈 함수다.
   *
   * 반환값이 **문자열**이라 매번 같은 값이면 같다고 판정된다 — 객체를 돌려주면
   * 무한 렌더가 된다.
   */
  const env = useSyncExternalStore<InstallEnv | null>(
    () => () => {},
    () =>
      detectInstallEnv({
        userAgent: navigator.userAgent,
        standalone: isStandaloneDisplay(window),
        // 이 줄에서는 설치 이벤트를 안 본다 — 안드로이드에서 이벤트가 아직 안 와도
        // 손으로 하는 안내를 띄우면 되고, 게이트가 다시 판정한다.
        hasPromptEvent: false,
      }),
    () => null,
  );

  // 서버 렌더 때는 아직 모른다. PC는 이 앱의 대상이 아니라 아예 안 그린다.
  if (env === null || env === "desktop") return null;

  if (env === "installed") {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <p className="text-sm font-bold">📲 홈 화면 앱으로 쓰고 있어요</p>
        <p className="mt-0.5 text-xs text-muted">
          잠금화면 알림도 여기서만 와요. 잘 하셨어요!
        </p>
      </section>
    );
  }

  return (
    <button
      onClick={() => window.dispatchEvent(new Event(OPEN_INSTALL_GUIDE_EVENT))}
      className="flex w-full items-center justify-between rounded-card border border-accent bg-surface p-4 text-left shadow-card"
    >
      <div>
        <p className="text-sm font-bold">📲 홈 화면에 앱 설치</p>
        <p className="mt-0.5 text-xs text-muted">
          앱처럼 바로 열리고, 잠금화면 알림도 받아요
        </p>
      </div>
      <span className="text-muted">›</span>
    </button>
  );
}
