// 소셜 순수 도메인 로직 — I/O 없음, TDD (§16)

import { dayKey } from "./time";

export type SocialEvent = {
  session_id: string;
  event_type: "workout_started" | "workout_completed" | "workout_cancelled";
  created_at: string;
};

export type WorkoutImageRelation =
  | { image_path: string }
  | { image_path: string }[]
  | null;

/**
 * PostgREST 임베드(객체 | 배열 | null) → 항상 배열.
 *
 * 0103 이전에는 `unique(session_id)` 때문에 세션당 1장이라 임베드가 객체로
 * 올 때도 배열로 올 때도 답이 하나였다. 이제 최대 5장이므로 **모든 호출부가
 * 같은 모양으로 받아야** 한다 — 그 정규화를 한 곳에 모은다.
 */
export function workoutImageList<T>(
  relation: T | T[] | null | undefined,
): T[] {
  if (relation === null || relation === undefined) return [];
  return Array.isArray(relation) ? relation : [relation];
}

/**
 * 대표 사진 한 장 — **`sort_order`가 가장 앞선 것.**
 *
 * ⚠️ 예전에는 그냥 `[0]`을 집었다. 세션당 1장일 때는 정답이 하나뿐이라 안
 *    보이던 문제인데, 2장이 되는 순간 **PostgREST 반환 순서에 좌우된다** —
 *    홈 화면 크루 카드에 아무 사진이나 뜬다(2026-09-10 조사에서 발견).
 *    `sort_order`가 없는 옛 모양으로 불리면 전부 0으로 봐서 **원래 순서가
 *    그대로 유지된다** — 옛 호출부의 동작이 안 바뀐다.
 */
export function firstWorkoutImagePath(
  relation: WorkoutImageRelation,
): string | null {
  const rows = workoutImageList(relation) as ({
    image_path: string;
  } & { sort_order?: number })[];
  if (rows.length === 0) return null;
  const sorted = [...rows].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  return sorted[0]?.image_path ?? null;
}

/** 유령 세션 컷오프: 시작 후 6시간 지나면 진행 중으로 안 본다 */
const ACTIVE_MAX_MS = 6 * 60 * 60 * 1000;

/**
 * 이벤트 목록 → 진행 중 세션 id (최근 시작 순).
 * started 이벤트가 있고, completed/cancelled 이벤트가 없고,
 * 시작이 6시간 이내인 세션만 진행 중으로 판정한다.
 */
export function activeSessionIds(
  events: SocialEvent[],
  now: Date = new Date(),
): string[] {
  const startedAt = new Map<string, number>();
  const closed = new Set<string>();

  for (const e of events) {
    if (e.event_type === "workout_started") {
      startedAt.set(e.session_id, Date.parse(e.created_at));
    } else {
      closed.add(e.session_id);
    }
  }

  return [...startedAt.entries()]
    .filter(
      ([sid, at]) => !closed.has(sid) && now.getTime() - at < ACTIVE_MAX_MS,
    )
    .sort((a, b) => b[1] - a[1])
    .map(([sid]) => sid);
}

/** 미읽음 알림 수 */
export function unreadCount(rows: { read_at: string | null }[]): number {
  return rows.filter((r) => r.read_at === null).length;
}

// ── 피드 날짜별 그룹핑 (2026-07-18 — 크루 인증 히스토리를 날짜 단위로) ──

export type DayGroup<T> = { dateKey: string; items: T[] };

/**
 * completedAt 내림차순으로 정렬된 목록 → tz 기준 날짜별 그룹 (순서 유지).
 * 피드 페이지네이션과 함께 쓰므로 정렬은 호출자 책임.
 */
export function groupByDay<T extends { completedAt: Date }>(
  items: T[],
  timeZone: string,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = dayKey(item.completedAt, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.dateKey === key) last.items.push(item);
    else groups.push({ dateKey: key, items: [item] });
  }
  return groups;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 날짜 그룹 헤더 라벨 — 오늘/어제/M월 D일 (요일), 다른 해면 연도 포함 */
export function feedDateLabel(
  dateKey: string,
  todayKey: string,
  yesterdayKey: string,
): string {
  if (dateKey === todayKey) return "오늘";
  if (dateKey === yesterdayKey) return "어제";
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekday = WEEKDAY_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const sameYear = todayKey.slice(0, 4) === dateKey.slice(0, 4);
  return sameYear
    ? `${m}월 ${d}일 (${weekday})`
    : `${y}년 ${m}월 ${d}일 (${weekday})`;
}
