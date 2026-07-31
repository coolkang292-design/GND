"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BugReportSheet } from "@/components/bug-report-sheet";
import { noteTrail } from "@/lib/domain/bug-trail";

import "./globals.css";

/**
 * 루트 레이아웃까지 죽었을 때의 최후 화면. `error.tsx`가 못 잡는 자리를 받는다.
 *
 * Next 규칙상 **자체 `<html>`·`<body>`를 직접 그려야 한다** — 이 컴포넌트가 루트
 * 레이아웃을 통째로 대체하기 때문이다. 그래서 `AuthProvider`도 `TrailTracker`도
 * 여기엔 없다.
 *
 * 경로를 `usePathname()`이 아니라 `location.pathname`으로 읽는 이유가 그것이다.
 * 라우터 컨텍스트가 성립한다는 보장이 없는 자리에서 훅이 던지면 **오류 화면이
 * 다시 죽어** 신고할 방법이 완전히 사라진다.
 *
 * 신고는 그대로 된다 — Supabase 세션은 쿠키에 있고 클라이언트는 싱글턴이라
 * Provider 없이도 만들어진다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 경로를 외부 값으로 읽는다. `useState` + `useEffect`로 하면 렌더가 한 번 더
  // 돌고(lint가 그걸 잡는다), 서버 스냅샷이 없어 하이드레이션도 어긋난다.
  // 여기는 구독할 것이 없으므로 subscribe는 빈 해제 함수만 돌려준다.
  const route = useSyncExternalStore(
    () => () => {},
    () => window.location.pathname,
    () => null, // 서버에는 location이 없다
  );

  useEffect(() => {
    noteTrail("fail", "crash:global", error.message);
  }, [error]);

  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex justify-center" suppressHydrationWarning>
        <div className="w-full max-w-[430px] min-h-dvh flex flex-col gap-3 bg-bg p-4">
          <header className="pt-2">
            <h1 className="text-[19px] font-extrabold tracking-tight">
              앱을 여는 데 실패했어요
            </h1>
            <p className="mt-1 text-[12.5px] text-muted">
              잠시 후 다시 시도해보세요. 계속 그러면 아래로 알려주세요.
            </p>
          </header>

          <button
            type="button"
            onClick={reset}
            className="w-full rounded-card-sm bg-accent px-4 py-3 text-sm font-extrabold text-accent-ink"
          >
            다시 시도
          </button>

          <BugReportSheet
            route={route}
            extraContext={{
              crash: error.message?.slice(0, 500),
              digest: error.digest ?? null,
              scope: "global",
            }}
          />
        </div>
      </body>
    </html>
  );
}
