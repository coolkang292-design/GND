"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import { ActiveWorkoutCards } from "@/components/feed/active-workout-cards";
import { DiscoverableChallenges } from "@/components/feed/discoverable-challenges";
import { FeedItemCard } from "@/components/feed/feed-item";
import { NotificationBell } from "@/components/notification-bell";
import { feedDateLabel, groupByDay } from "@/lib/domain/social";
import { dayKey, resolveTimeZone } from "@/lib/domain/time";
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

  /**
   * 알림에서 온 게시물 (0082) — `/feed?session=<id>`.
   *
   * 그 세션이 첫 페이지 20건 밖에 있을 수 있어서 **따로 한 건을 집어 와**
   * 상단에 고정한다. 목록에도 있으면 아래에서 빼서 두 번 그리지 않는다.
   *
   * `null`은 "요청이 없었다", `"missing"`은 "요청은 있었는데 못 찾았다"다.
   * 둘을 합치면 지워졌거나 크루가 끊긴 게시물로 들어왔을 때 **아무 말 없이
   * 그냥 피드가 뜨고**, 사용자는 알림이 고장 났다고 생각한다.
   */
  const [pinned, setPinned] = useState<FeedItem | "missing" | null>(null);

  /**
   * ⚠️ `useSearchParams`를 쓰지 않는다 — Suspense 경계를 요구해 빌드가 깨진다.
   *    이 저장소가 그 훅을 세 번 거부했다(`login/page.tsx:50`·`auth/callback`·
   *    `record-view.ts`).
   *
   * ⚠️ `useEffect` + `setState`도 아니다. `react-hooks/set-state-in-effect`가
   *    막고, 초기값을 `window`에서 읽으면 서버가 그린 것과 달라져 하이드레이션이
   *    깨진다. `useSyncExternalStore`가 정확히 이 경우를 위한 것이다 —
   *    서버 스냅샷은 null, 하이드레이션 뒤 클라이언트 값으로 한 번 다시 그린다.
   *    (`login/page.tsx`의 `fromInstalled`와 같은 수법)
   *
   * ⚠️ **주소에서 파라미터를 지우지 않는다.** `history.replaceState`로 지우면
   *    다음 렌더의 스냅샷이 달라져 고정 카드가 **스스로 사라진다.** 남겨 두면
   *    그 게시물의 고정 링크가 되고, 탭바로 `/feed`에 다시 오면 알아서 풀린다.
   */
  const pinnedId = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("session"),
    () => null,
  );

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

  useEffect(() => {
    if (!configured || loading || !userId || !pinnedId) return;
    let cancelled = false;

    async function load() {
      try {
        // 같은 질의에 id 조건만 더한 것이라 가시성 규칙이 갈라지지 않는다
        const found = await getCrewFeed(userId!, undefined, false, pinnedId!);
        if (!cancelled) setPinned(found[0] ?? "missing");
      } catch {
        if (!cancelled) setPinned("missing");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId, pinnedId]);

  // 날짜별 히스토리 그룹 — 크루 운동을 날짜 단위로 훑어볼 수 있게 (2026-07-18)
  // 기준 시각은 마운트 시 1회 고정 (렌더 중 Date.now()는 purity 규칙 위반)
  const [dateRef] = useState(() => {
    const tz = resolveTimeZone();
    const now = Date.now();
    return {
      tz,
      todayKey: dayKey(new Date(now), tz),
      yesterdayKey: dayKey(new Date(now - 24 * 60 * 60 * 1000), tz),
    };
  });
  const dayGroups = useMemo(
    () =>
      groupByDay(
        // 상단에 고정한 것은 목록에서 뺀다 — 안 그러면 같은 카드가 둘이다
        pinnedId ? items.filter((i) => i.sessionId !== pinnedId) : items,
        dateRef.tz,
      ),
    [items, dateRef, pinnedId],
  );

  /** 카드가 스스로 바꾼 것(캡션·댓글)을 목록에 되돌린다 */
  const updateItem = useCallback((next: FeedItem) => {
    setItems((prev) =>
      prev.map((i) => (i.sessionId === next.sessionId ? next : i)),
    );
    setPinned((prev) =>
      prev && prev !== "missing" && prev.sessionId === next.sessionId
        ? next
        : prev,
    );
  }, []);

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

      {/*
        같이 할 챌린지 (0085) — 진행 중 카드 **아래**, 날짜별 피드 **위**.

        ⚠️⚠️ 아래 `items.length === 0` 분기 **바깥**에 둔다. 크루가 0명인 신규
           사용자는 피드가 비는데, 그때 이 줄까지 숨기면 **이 기능이 가장 필요한
           사람에게 안 보인다.** 스스로 조회하고, 0개면 스스로 사라진다.
      */}
      <DiscoverableChallenges />

      {pinnedId && (
        <section className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-xs font-extrabold text-accent">
            <span>🔔</span> 알림에서 열어 본 운동
          </p>
          {pinned === null ? (
            <p className="py-4 text-center text-sm text-muted">불러오는 중…</p>
          ) : pinned === "missing" ? (
            <p className="rounded-card border border-line bg-surface p-4 text-center text-sm text-muted shadow-card">
              지금은 볼 수 없는 운동이에요. 지워졌거나 크루가 아니게 됐어요.
            </p>
          ) : (
            <FeedItemCard
              item={pinned}
              userId={userId!}
              onProfileClick={() => setSelected(pinned)}
              onItemChange={updateItem}
              openComments
            />
          )}
        </section>
      )}

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
                  onItemChange={updateItem}
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
          viewerId={userId ?? undefined}
          source="feed"
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
