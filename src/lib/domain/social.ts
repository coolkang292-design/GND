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

export function firstWorkoutImagePath(
  relation: WorkoutImageRelation,
): string | null {
  if (relation === null) return null;
  return Array.isArray(relation)
    ? relation[0]?.image_path ?? null
    : relation.image_path;
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
