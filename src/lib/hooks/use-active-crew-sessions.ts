"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { getActiveCrewSessions, type ActiveCrewSession } from "@/lib/social";

/** 완료·신규를 반영하는 주기. 카드와 트레이가 같은 값을 써야 둘이 안 어긋난다. */
export const ACTIVE_POLL_MS = 60_000;

/**
 * 진행 중 크루 세션 조회 + 폴링 (Phase C에서 `ActiveWorkoutCards`에서 들어냈다).
 *
 * 왜 훅으로 뺐나: 같은 데이터를 **홈은 카드로, 피드는 스토리 트레이로** 그리게
 * 됐다. 조회 로직이 카드 컴포넌트 안에 있으면 트레이가 그것을 쓰려고 카드를
 * import하게 되고, 그러면 트레이를 고칠 때 홈 카드가 같이 흔들린다.
 *
 * ⚠️ **홈은 이 훅을 쓰지 않는다.** 홈은 같은 값을 친구 목록의 "🔥 운동 중"
 *    판정에도 써서 이미 한 번만 조회해 내려주고 있다. 홈이 이 훅을 또 부르면
 *    같은 질의가 홈에서 두 번 나가고 폴링도 두 벌이 된다.
 */
export function useActiveCrewSessions(
  options: {
    /**
     * 끄면 조회도 폴링도 안 한다 (기본 켜짐).
     *
     * ⚠️ **훅은 조건부로 부를 수 없다.** 부모가 이미 데이터를 갖고 있어도
     *    `useActiveCrewSessions()`를 부르는 순간 effect가 돌아 같은 질의가 한 번
     *    더 나간다. 옛 코드는 컴포넌트 안 effect에서 `if (provided) return`으로
     *    막고 있었는데, 훅으로 들어내면서 그 가드가 사라졌다 —
     *    story-tray.test.tsx가 잡았다. 스위치를 여기 둬서 복원한다.
     */
    enabled?: boolean;
  } = {},
): {
  sessions: ActiveCrewSession[];
  myUserId: string | null;
} {
  const enabled = options.enabled ?? true;
  const { userId, loading, configured } = useAuth();
  const [sessions, setSessions] = useState<ActiveCrewSession[]>([]);

  useEffect(() => {
    if (!enabled) return;
    if (!configured || loading || !userId) return;
    let cancelled = false;

    async function load() {
      try {
        // 0039: 그룹 소속 → 크루 연결. 그룹이 없어도 크루가 있으면 보여야 한다.
        const active = await getActiveCrewSessions(userId!);
        if (!cancelled) setSessions(active);
      } catch {
        /* 진행 중 표시는 부가 정보 — 실패해도 화면을 막지 않는다 */
      }
    }
    void load();
    const interval = setInterval(() => void load(), ACTIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, configured, loading, userId]);

  return { sessions, myUserId: userId ?? null };
}
