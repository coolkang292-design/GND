"use client";

import { useEffect } from "react";
import { captureAcquisitionOnce } from "@/lib/acquisition";

/**
 * 첫 진입의 유입 출처를 붙잡아 둔다. 루트 레이아웃에 한 번만 둔다.
 *
 * ⚠️ **의존성 없는 effect다 — 마운트 때 딱 한 번 돌아야 한다.** `usePathname()`을
 *    넣어 화면 이동마다 돌게 만들면, 앱 안에서 이동한 뒤의 주소(쿼리스트링이
 *    사라진 상태)를 첫 접촉으로 잡을 위험이 생긴다. `captureAcquisitionOnce`가
 *    덮어쓰기를 막긴 하지만, 방어선을 하나에만 걸지 않는다.
 *
 * 렌더는 아무것도 하지 않는다(`TrailTracker`와 같은 규약).
 */
export function AcquisitionTracker() {
  useEffect(() => {
    captureAcquisitionOnce();
  }, []);

  return null;
}
