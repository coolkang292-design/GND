"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { recordFunnelEvent } from "@/lib/analytics-events";

/**
 * 유입(`landing_opened`)을 한 번 기록한다. 루트 레이아웃에 한 번만 둔다.
 *
 * ⚠️ **`AuthProvider` 안에 둬야 한다.** 익명 계정은 `AuthProvider`가 발급하므로
 *    그 밖(=`AcquisitionTracker` 자리)에서는 `userId`가 영원히 null이다.
 *    `AcquisitionTracker`는 반대로 밖에 있어야 한다 — 그쪽은 세션이 필요 없고
 *    주소창의 utm이 살아 있는 가장 이른 순간에 잡아야 하기 때문이다.
 *
 * ⚠️ **`userId`를 의존성에 넣는다.** 마운트 시점에는 아직 익명 계정이 없어
 *    `userId`가 null이다. 발급된 뒤 한 번 더 돌아야 기록된다 —
 *    `AcquisitionTracker`의 "의존성 없는 effect"를 여기 그대로 흉내내면
 *    **유입이 한 건도 안 잡힌다.**
 *
 * ⚠️ 유입 값 자체(`utm`)는 `AcquisitionTracker`가 이미 localStorage에 재워 뒀다.
 *    여기서는 그것을 읽어 실어 보내기만 한다 — 파싱을 두 곳에 두지 않는다.
 *
 * 렌더는 아무것도 하지 않는다(`TrailTracker`·`AcquisitionTracker`와 같은 규약).
 */
export function FunnelTracker() {
  const { userId } = useAuth();

  useEffect(() => {
    if (!userId) return;
    void recordFunnelEvent("landing_opened", userId);
  }, [userId]);

  return null;
}
