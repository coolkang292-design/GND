"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import { ActiveWorkoutCards } from "@/components/feed/active-workout-cards";
import { FeedItemCard } from "@/components/feed/feed-item";
import { NotificationBell } from "@/components/notification-bell";
import { feedDateLabel, groupByDay } from "@/lib/domain/social";
import { dayKey } from "@/lib/domain/time";
import {
  FEED_PAGE_SIZE,
  getCrewFeed,
  type FeedItem,
} from "@/lib/social";

export default function FeedPage() {
  const { userId, loading, configured } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // 시트는 화면당 1개만 띄운다 — 카드마다 두면 DOM이 항목 수만큼 늘어난다
  const [selected, setSelected] = useState<FeedItem | null>(null);
  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;

    async function load() {
      setReady(false);
      setItems([]);
      setHasMore(false);
      try {
        // 0039: 그룹 소속이 아니라 크루 연결 기준. 크루가 없어도 내 운동은 보이므로
        // 그룹 유무로 피드 전체를 접던 가드를 없앴다.
        const page = await getCrewFeed(userId!);
        if (cancelled) return;
        setItems(page);
        setHasMore(page.length === FEED_PAGE_SIZE);
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  // 날짜별 히스토리 그룹 — 크루 운동을 날짜 단위로 훑어볼 수 있게 (2026-07-18)
  // 기준 시각은 마운트 시 1회 고정 (렌더 중 Date.now()는 purity 규칙 위반)
  const [dateRef] = useState(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = Date.now();
    return {
      tz,
      todayKey: dayKey(new Date(now), tz),
      yesterdayKey: dayKey(new Date(now - 24 * 60 * 60 * 1000), tz),
    };
  });
  const dayGroups = useMemo(
    () => groupByDay(items, dateRef.tz),
    [items, dateRef],
  );

  const loadMore = useCallback(async () => {
    if (!userId || items.length === 0) return;
    setLoadingMore(true);
    try {
      const before = items[items.length - 1].completedAt.toISOString();
      const page = await getCrewFeed(userId, before);
      setItems((prev) => [...prev, ...page]);
      setHasMore(page.length === FEED_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, items]);

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between pt-2 pb-1">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">피드</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            크루의 운동, 같이 봐요 👀
          </p>
        </div>
        <NotificationBell />
      </header>

      <ActiveWorkoutCards />

      {!ready ? (
        <p className="py-10 text-center text-sm text-muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <section className="rounded-card border border-line bg-surface p-5 text-center shadow-card">
          <p className="text-sm font-bold">아직 운동 기록이 없어요</p>
          <p className="mt-1 text-xs text-muted">
            첫 운동을 완료하면 여기에 나타나요 💪
          </p>
          <p className="mt-1 text-xs text-muted">
            내 정보 › 크루에서 닉네임으로 크루를 추가하면 서로의 운동도 보여요.
          </p>
        </section>
      ) : (
        <>
          {dayGroups.map((g) => (
            <section key={g.dateKey} className="flex flex-col gap-3">
              <p className="mt-1 flex items-center gap-2 text-xs font-extrabold text-muted">
                <span className="text-accent">📅</span>
                {feedDateLabel(g.dateKey, dateRef.todayKey, dateRef.yesterdayKey)}
                <span className="font-bold text-faint">
                  운동 {g.items.length}
                </span>
              </p>
              {g.items.map((item) => (
                <FeedItemCard
                  key={item.sessionId}
                  item={item}
                  userId={userId!}
                  onProfileClick={() => setSelected(item)}
                />
              ))}
            </section>
          ))}
          {hasMore && (
            <button
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="h-11 w-full rounded-card-sm border border-line text-sm font-bold text-accent disabled:opacity-60"
            >
              {loadingMore ? "불러오는 중…" : "더 보기"}
            </button>
          )}
        </>
      )}

      {selected && (
        <MemberProfileSheet
          userId={selected.userId}
          nickname={selected.nickname}
          avatarUrl={selected.avatarUrl}
          streak={selected.streak}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
