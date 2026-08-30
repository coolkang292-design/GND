"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ImageLightbox } from "@/components/image-lightbox";
import { FEED_PAGE_SIZE, getCrewFeed, type FeedItem } from "@/lib/social";

/**
 * 사진 그리드 (Phase D, 2026-08-31).
 *
 * ⚠️ `getCrewFeed`의 `photoOnly` 파라미터는 **처음부터 구현돼 있었는데 아무도
 *    부르지 않았다.** 인증사진이 쌓이는데 모아 볼 곳이 없으면, 올린 사람 입장에서
 *    사진은 한 번 스크롤에 스쳐 가고 끝이다.
 *
 * ⚠️ 세로 목록과 **같은 질의**를 쓴다(정렬·커서·가시성 조건이 하나다). 여기서
 *    따로 질의를 만들면 크루 판정이 두 곳으로 갈라지고, 갈라지면 언젠가 한쪽만
 *    고쳐진다 — `getCrewFeed`의 `onlySessionId` 주석이 같은 이유를 적고 있다.
 */
export function PhotoGrid({ userId }: { userId: string }) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const sentinelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await getCrewFeed(userId, undefined, true);
        if (!cancelled) {
          setItems(page);
          setHasMore(page.length === FEED_PAGE_SIZE);
        }
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!items || items.length === 0) return;
    setLoadingMore(true);
    try {
      const before = items[items.length - 1].completedAt.toISOString();
      const page = await getCrewFeed(userId, before, true);
      setItems((prev) => [...(prev ?? []), ...page]);
      setHasMore(page.length === FEED_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, items]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (typeof IntersectionObserver === "undefined") return; // 버튼으로 폴백
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore, loadingMore]);

  if (items === null) {
    return <p className="py-8 text-center text-sm text-muted">불러오는 중…</p>;
  }

  if (items.length === 0) {
    return (
      <section className="rounded-card border border-line bg-surface p-5 text-center shadow-card">
        <p className="text-sm font-bold">아직 인증사진이 없어요</p>
        <p className="mt-1 text-xs text-muted">
          운동을 마치고 사진을 올리면 여기에 모여요.
        </p>
      </section>
    );
  }

  return (
    <>
      {/* 3열 정사각. 간격을 1px로 붙여 사진이 면으로 읽히게 한다 — 카드처럼
          띄우면 그리드로 볼 이유가 없다. */}
      <ul className="grid grid-cols-3 gap-[3px]">
        {items.map((item) => (
          <li key={item.sessionId} className="relative aspect-square">
            <button
              type="button"
              onClick={() => setOpen(item)}
              aria-label={`${item.nickname}님의 인증사진 크게 보기`}
              className="h-full w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.photoUrl!}
                alt={`${item.nickname}님의 운동 인증`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          ref={sentinelRef}
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-3 h-11 w-full rounded-card-sm border border-line text-sm font-bold text-accent disabled:opacity-60"
        >
          {loadingMore ? "불러오는 중…" : "더 보기"}
        </button>
      )}

      {open?.photoUrl && (
        <ImageLightbox
          src={open.photoUrl}
          alt={`${open.nickname}님의 운동 인증`}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
