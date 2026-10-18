"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AchievementHistoryTimeline } from "@/components/profile/recent-achievement-history";
import { getMyAchievementHistory } from "@/lib/achievement-history";
import type { AchievementEvent, AchievementEventType } from "@/lib/domain/profile-achievements";

type Filter = "all" | AchievementEventType;
const FILTERS: readonly { key: Filter; label: string }[] = [
  { key: "all", label: "전체" }, { key: "level", label: "레벨업" },
  { key: "badge", label: "배지" }, { key: "joined", label: "가입" },
];

export default function ProfileHistoryPage() {
  const { userId, loading, configured } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [events, setEvents] = useState<AchievementEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    getMyAchievementHistory(userId)
      .then((rows) => { if (!cancelled) { setEvents(rows); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [configured, loading, userId, retryKey]);

  const visible = (events ?? []).filter((event) => filter === "all" || event.type === filter);

  return (
    <div className="flex flex-col gap-5 pb-8">
      <header className="pt-2">
        <h1 className="text-[28px] font-black">전체 이력</h1>
        <p className="mt-1 text-[13px] text-muted">성취 기록을 최신순으로 확인</p>
        <Link href="/profile" className="tap-44 mt-3 inline-flex items-center text-[13px] font-extrabold text-accent">
          ‹ 프로필로 돌아가기
        </Link>
      </header>
      <nav aria-label="성취 이력 필터" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={"tap-44 shrink-0 rounded-full border px-4 text-[12px] font-extrabold " +
              (filter === item.key
                ? "border-accent bg-accent text-accent-ink"
                : "border-line bg-surface text-muted")}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {!configured || (configured && !loading && !userId) ? (
        <p className="text-sm text-muted">로그인 후 확인할 수 있어요.</p>
      ) : failed ? (
        <section className="rounded-card border border-line bg-surface p-4">
          <p className="text-sm font-bold">이력을 불러오지 못했어요.</p>
          <button
            type="button"
            className="tap-44 mt-2 rounded-full border border-accent px-4 text-sm text-accent"
            onClick={() => { setFailed(false); setEvents(null); setRetryKey((k) => k + 1); }}
          >
            다시 시도
          </button>
        </section>
      ) : events === null ? (
        <p aria-busy="true" className="text-sm text-muted">성취 이력을 불러오는 중…</p>
      ) : (
        <AchievementHistoryTimeline events={visible} />
      )}
      <p className="text-center text-[11px] leading-relaxed text-faint">
        성취 기록은 삭제하지 않고 표시합니다. 레벨 달성일은 XP 거래 원장을 기준으로 계산합니다.
      </p>
    </div>
  );
}
