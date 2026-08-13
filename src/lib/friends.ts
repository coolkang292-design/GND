import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getBadgeCatalog } from "@/lib/badges";
import { getMyCrew } from "@/lib/crew-link";
import { getCrewMemberProfile } from "@/lib/progression";
import { compareBadgeShowcase, earnedBadgeCount } from "@/lib/domain/badges";
import { getMyRecentPokeTargets } from "@/lib/social";
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";
import {
  foldFriendSessions,
  FRIEND_BADGE_PREVIEW,
  FRIEND_SESSION_ROW_LIMIT,
  type FriendActivity,
  type FriendBadges,
  type FriendCrewInput,
  type FriendSessionRow,
} from "@/lib/domain/friend-board";

/**
 * 홈 친구 목록 데이터 (배지 제외).
 *
 * 설계: `docs/superpowers/specs/2026-08-07-home-friend-board-and-challenge-consolidation-design.md`
 *
 * 새 DB 작업이 **0건**이다 — 필요한 것이 전부 이미 읽히는 자리에 있다.
 *   1) `get_my_crew()`        명단·닉네임·아바타·total_xp     (RPC 1)
 *   2) `workout_sessions`     횟수·시간·오늘여부·스트릭        (질의 1)
 *   3) `get_my_recent_pokes`  찌르기 쿨다운                    (RPC 1)
 *
 * 배지는 **1인 1콜**이라 여기 넣지 않는다(`getFriendBadgeCounts`). 같이 묶으면
 * 목록 전체가 가장 느린 배지 응답을 기다린다.
 */
export type FriendBoardBase = {
  crew: FriendCrewInput[];
  activity: Map<string, FriendActivity>;
  /** 24시간 안에 이미 찌른 상대 — 앱을 다시 켜도 "✅ 찌름"이 유지된다(0053) */
  poked: Set<string>;
  /** 세션 행이 상한에 닿았다 = 숫자가 일부만 반영됐다. 화면이 그 사실을 말해야 한다. */
  truncated: boolean;
};

/**
 * @param meId 내 사용자 id. **내 활동도 같은 질의로 받는다** — 2026-08-07 사용자
 *   지시로 목록 맨 위에 내 행이 생겼다. 따로 부르면 질의가 하나 늘고, 더 나쁘게는
 *   필터가 갈려 내 숫자만 다른 자로 재게 된다.
 */
export async function getFriendBoardBase(
  meId: string,
): Promise<FriendBoardBase> {
  const crewMembers = await getMyCrew();
  const crew: FriendCrewInput[] = crewMembers.map((m) => ({
    id: m.id,
    nickname: m.nickname,
    avatarUrl: m.avatarUrl,
    totalXp: m.totalXp,
  }));
  if (crew.length === 0) {
    // 친구가 없으면 화면이 카드 안에서 친구 초대 안내를 그린다 — 내 행 한 줄만
    // 있는 "친구 목록"은 목록이 아니다. 그릴 게 없으니 질의도 하지 않는다.
    return { crew, activity: new Map(), poked: new Set(), truncated: false };
  }

  const [sessions, poked] = await Promise.all([
    fetchFriendSessions([meId, ...crew.map((m) => m.id)]),
    getMyRecentPokeTargets(),
  ]);

  return {
    crew,
    activity: foldFriendSessions(sessions.rows, new Date(), DEFAULT_TIMEZONE),
    poked,
    truncated: sessions.truncated,
  };
}

/**
 * 나와 친구들의 완료 세션.
 *
 * ⚠️ `visibility='group'`을 **명시**한다. RLS가 어차피 친구 세션을 그렇게 좁히지만,
 * **내 세션은 RLS가 비공개까지 통과시킨다.** 그래서 이 필터가 빠지면 목록에서
 * 내 행만 비공개 세션까지 세어 부풀고, 나와 친구를 같은 자로 잰 값이 아니게 된다.
 * 2026-08-06까지는 나를 아예 안 넣어서 이 실수가 드러나지 않았다 — 이제 드러난다.
 * `friends.test.ts`가 `eq(visibility, group)`을 단언으로 고정한다.
 *
 * ⚠️ `limit`은 자르려는 게 아니라 **잘렸는지 알려고** 건다. 서버 응답 상한에
 * 걸리면 오류 없이 숫자만 조용히 틀린다 — 가장 나쁜 실패 모양이다.
 */
async function fetchFriendSessions(
  userIds: string[],
): Promise<{ rows: FriendSessionRow[]; truncated: boolean }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("user_id, completed_at, duration_minutes")
    .in("user_id", userIds)
    .eq("status", "completed")
    .eq("visibility", "group")
    .is("deleted_at", null)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(FRIEND_SESSION_ROW_LIMIT);
  if (error) throw error;

  const raw = (data ?? []) as {
    user_id: string;
    completed_at: string;
    duration_minutes: number | null;
  }[];
  return {
    rows: raw.map((r) => ({
      userId: r.user_id,
      completedAt: r.completed_at,
      durationMinutes: r.duration_minutes,
    })),
    truncated: raw.length >= FRIEND_SESSION_ROW_LIMIT,
  };
}

/**
 * 친구별 보유 배지 — 개수 + 최근에 딴 배지 키.
 *
 * `user_badges`는 RLS상 **본인 행만** 보인다(`user_badges_own_select`). 남의 배지는
 * 정의자 RPC `get_crew_member_profile`로만 나오고 그 RPC는 한 번에 한 명이다.
 * 그래서 **사람 수만큼 병렬 호출**한다 — 크루가 커지면 배치 RPC로 접는다(설계 §7).
 *
 * ⚠️ `allSettled`다. 한 명이 실패해도 나머지 행은 그린다. 실패한 사람은 맵에서
 * 빠지고 `buildFriendRows`가 `null`로 남겨 화면에 "—"로 나온다 — **0개가 아니다**.
 *
 * 개수 정의는 `earnedBadgeCount`를 그대로 쓴다. 프로필 시트의 "보유 배지 N / M"과
 * 같은 함수라 두 화면의 숫자가 어긋날 수 없다.
 *
 * ⚠️ **키는 카탈로그에 있는 것만 남긴다.** `/badges/<key>.png`를 그대로 그리므로
 * 카탈로그에 없는 키가 섞이면 화면에 **깨진 이미지**가 뜬다(RPC는 `user_badges`
 * 행을 그대로 준다 — 카탈로그에서 내린 배지도 올 수 있다).
 */
export async function getFriendBadges(
  userIds: string[],
): Promise<Map<string, FriendBadges>> {
  const result = new Map<string, FriendBadges>();
  if (userIds.length === 0) return result;

  const catalog = await getBadgeCatalog();
  const settled = await Promise.allSettled(
    userIds.map((id) => getCrewMemberProfile(id)),
  );

  const metaByKey = new Map(catalog.map((m) => [m.key, m]));

  settled.forEach((entry, i) => {
    if (entry.status !== "fulfilled") return;
    const badges = entry.value.badges;
    /*
      **등급순**이다 — 최신순이 아니다 (2026-08-09 사용자 지시 "배지 퀄리티 좋은거
      먼저 보여주기"). 예전에는 방금 딴 `first_workout`이 오래전에 딴 `legend`를
      밀어냈다. 자랑하라고 만든 자리인데 자랑할 것이 안 보였다.

      정렬 규칙은 `compareBadgeShowcase`(희귀도 → 티어 → 최신)가 갖는다. 여기서
      비교식을 다시 쓰지 마라 — 규칙이 두 곳에 있으면 갈린다.

      같은 배지를 반복해 따도 썸네일은 한 번만 쓴다(개수 정의 `earnedBadgeCount`와
      같은 규약). 반복 배지는 **가장 최근 획득**을 대표로 삼는다.
    */
    const best = new Map<string, { key: string; earnedAt: Date }>();
    for (const badge of badges) {
      // 카탈로그에 없는 키는 버린다 — `/badges/<key>.png`가 깨진 이미지로 뜬다.
      if (!metaByKey.has(badge.badgeKey)) continue;
      const prev = best.get(badge.badgeKey);
      if (!prev || badge.earnedAt > prev.earnedAt) {
        best.set(badge.badgeKey, {
          key: badge.badgeKey,
          earnedAt: badge.earnedAt,
        });
      }
    }

    const showcaseKeys = [...best.values()]
      .sort((a, b) =>
        compareBadgeShowcase(
          { ...metaByKey.get(a.key)!, earnedAt: a.earnedAt },
          { ...metaByKey.get(b.key)!, earnedAt: b.earnedAt },
        ),
      )
      .slice(0, FRIEND_BADGE_PREVIEW)
      .map((b) => b.key);

    result.set(userIds[i], {
      total: earnedBadgeCount(catalog, badges),
      showcaseKeys,
    });
  });
  return result;
}
