"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  subscribeNotifications,
  type NotificationRow,
} from "@/lib/social";

const CHEER_EMOJI: Record<string, string> = {
  fire: "🔥",
  power: "💪",
  clap: "👏",
  finish: "🏁",
};

/**
 * Realtime 응원 인앱 배너 (§스펙 결정 3) — notifications INSERT 구독,
 * cheer_received만 상단 배너로 4초 노출. 나머지 타입은 알림함(durable)에서.
 */
export function CheerBanner() {
  const { userId, loading, configured } = useAuth();
  const [banner, setBanner] = useState<NotificationRow | null>(null);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = subscribeNotifications(userId, (n) => {
      if (n.type !== "cheer_received") return;
      setBanner(n);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setBanner(null), 4000);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [configured, loading, userId]);

  if (!banner) return null;

  const emoji = CHEER_EMOJI[banner.body ?? ""] ?? null;

  return (
    // ⚠️ `top-3`으로 되돌리지 마라 (2026-08-09). 설치형 앱은 `viewportFit:
    //    "cover"` + `display: standalone`이라 페이지가 상태바 밑까지 그려진다 —
    //    12px에 띄우면 배너가 상태바에 가려 **보이지 않는다.** 오버레이 상단
    //    여백과 같은 원인이다(`active-session-overlay.tsx` 주석).
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-card border border-accent/50 bg-surface px-4 py-3 shadow-card">
        <span className="text-xl">📣</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">{banner.title}</p>
          <p className="truncate text-xs font-bold text-accent">
            {emoji ?? banner.body ?? ""}
          </p>
        </div>
      </div>
    </div>
  );
}
