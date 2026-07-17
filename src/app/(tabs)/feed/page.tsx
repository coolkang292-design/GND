"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ActiveWorkoutCards } from "@/components/feed/active-workout-cards";
import { FeedItemCard } from "@/components/feed/feed-item";
import { NotificationBell } from "@/components/notification-bell";
import { getMyGroups } from "@/lib/crew";
import {
  FEED_PAGE_SIZE,
  getGroupFeed,
  type FeedItem,
} from "@/lib/social";
import type { Group } from "@/lib/types";

export default function FeedPage() {
  const { userId, loading, configured } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;

    async function load() {
      try {
        const groups = await getMyGroups();
        if (cancelled) return;
        const g = groups[0] ?? null;
        setGroup(g);
        if (g) {
          const page = await getGroupFeed(g.id, userId!);
          if (cancelled) return;
          setItems(page);
          setHasMore(page.length === FEED_PAGE_SIZE);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  const loadMore = useCallback(async () => {
    if (!group || !userId || items.length === 0) return;
    setLoadingMore(true);
    try {
      const before = items[items.length - 1].completedAt.toISOString();
      const page = await getGroupFeed(group.id, userId, before);
      setItems((prev) => [...prev, ...page]);
      setHasMore(page.length === FEED_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [group, userId, items]);

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
      ) : !group ? (
        <section className="rounded-card border border-line bg-surface p-5 text-center shadow-card">
          <p className="text-sm font-bold">아직 크루가 없어요</p>
          <p className="mt-1 text-xs text-muted">
            홈에서 크루를 만들거나 초대 링크로 참여해보세요.
          </p>
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-card border border-line bg-surface p-5 text-center shadow-card">
          <p className="text-sm font-bold">아직 크루 운동이 없어요</p>
          <p className="mt-1 text-xs text-muted">
            첫 운동을 완료하면 여기에 나타나요 💪
          </p>
        </section>
      ) : (
        <>
          {items.map((item) => (
            <FeedItemCard key={item.sessionId} item={item} userId={userId!} />
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
    </div>
  );
}
