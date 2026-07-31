"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { noteTrail } from "@/lib/domain/bug-trail";

/**
 * 화면 이동을 흔적에 남긴다. 루트 레이아웃에 한 번만 둔다.
 *
 * 경로만 담는다 — 동적 세그먼트에 id가 들어갈 수 있지만 이 앱의 라우트는 전부
 * 정적이다(`/home`·`/challenge`·`/record`…). 나중에 `/x/[id]` 같은 경로가 생기면
 * 여기서 마스킹해야 한다.
 *
 * 렌더는 아무것도 하지 않는다.
 */
export function TrailTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) noteTrail("nav", pathname);
  }, [pathname]);

  return null;
}
