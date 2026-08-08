/**
 * 프로필 이모지 목록 — **온보딩과 프로필 편집 시트의 단일 원천** (2026-08-08).
 *
 * ⚠️ 복사하지 마라. 한쪽에만 이모지를 더하면 다른 쪽이 조용히 뒤처지고, 사용자가
 * "폰에서는 보이는데 여기선 못 고르는" 상태가 된다.
 *
 * ⚠️ **이모지 문자열이다. URL을 넣지 마라.** `profiles.avatar_url`이라는 이름과
 * 달리 앱 전체(크루 목록·닉네임 검색·프로필 시트·피드·킹 카드·챌린지·관리자
 * **12곳**)가 이 값을 **글자로 렌더한다.** URL을 넣으면 그 12곳이 전부 깨진
 * 텍스트를 그린다. 제공자 프로필 사진을 쓰지 않기로 한 이유이기도 하다(설계 §4.2).
 */
export const AVATARS = [
  "🧔",
  "🧑",
  "👦",
  "👩",
  "🤓",
  "💁‍♀️",
  "🤵",
  "🧗",
  "🏃",
] as const;

export type Avatar = (typeof AVATARS)[number];

/**
 * 온보딩이 넣는 기본값. `profiles.avatar_url`이 not null이라 **반드시** 채운다.
 *
 * 온보딩에서 이모지 선택을 빼면(§4.2) 전원이 이 값으로 시작한다 — 그래서 프로필
 * 편집 시트가 **같은 배치에 있어야 한다.** 없으면 12곳이 영구히 `🧔`가 된다.
 */
export const DEFAULT_AVATAR: Avatar = AVATARS[0];

/** 온보딩이 넣는 기본 주간 목표. `weekly_goal`도 not null이다. */
export const DEFAULT_WEEKLY_GOAL = 3;

export const MIN_WEEKLY_GOAL = 1;
export const MAX_WEEKLY_GOAL = 7;

/** 스테퍼가 범위를 벗어나지 않게 자른다 */
export function clampWeeklyGoal(n: number): number {
  return Math.min(MAX_WEEKLY_GOAL, Math.max(MIN_WEEKLY_GOAL, n));
}
