import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getBadgeCatalog } from "@/lib/badges";
import { getMyCrew } from "@/lib/crew-link";
import { getCrewMemberProfile } from "@/lib/progression";
import { earnedBadgeCount } from "@/lib/domain/badges";
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

export async function getFriendBoardBase(): Promise<FriendBoardBase> {
  const crewMembers = await getMyCrew();
  const crew: FriendCrewInput[] = crewMembers.map((m) => ({
    id: m.id,
    nickname: m.nickname,
    avatarUrl: m.avatarUrl,
    totalXp: m.totalXp,
  }));
  if (crew.length === 0) {
    return { crew, activity: new Map(), poked: new Set(), truncated: false };
  }

  const [sessions, poked] = await Promise.all([
    fetchFriendSessions(crew.map((m) => m.id)),
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
 * 친구들의 완료 세션.
 *
 * ⚠️ `visibility='group'`을 **명시**한다. RLS가 어차피 친구 세션을 그렇게 좁히지만,
 * 명시하지 않으면 "왜 이 숫자가 이런가"가 코드에 안 남는다. 나를 이 목록에 넣지
 * 않는 이유도 같다 — 나는 내 비공개 세션까지 보이므로 **같은 자로 잰 값이 아니다**.
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
  const known = new Set(catalog.map((m) => m.key));
  const settled = await Promise.allSettled(
    userIds.map((id) => getCrewMemberProfile(id)),
  );

  settled.forEach((entry, i) => {
    if (entry.status !== "fulfilled") return;
    const badges = entry.value.badges;
    // 최신순 — 같은 배지를 반복해 따도 썸네일은 한 번만 쓴다(개수 정의와 같다).
    const recentKeys: string[] = [];
    const seen = new Set<string>();
    for (const badge of [...badges].sort(
      (a, b) => b.earnedAt.getTime() - a.earnedAt.getTime(),
    )) {
      if (!known.has(badge.badgeKey) || seen.has(badge.badgeKey)) continue;
      seen.add(badge.badgeKey);
      recentKeys.push(badge.badgeKey);
      if (recentKeys.length === FRIEND_BADGE_PREVIEW) break;
    }
    result.set(userIds[i], {
      total: earnedBadgeCount(catalog, badges),
      recentKeys,
    });
  });
  return result;
}
