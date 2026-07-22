/**
 * 스트릭(불꽃) 도메인 순수 함수 (§8·§16 streak.ts).
 * 하루 1회+ 완료 = 운동일(사용자 tz). 5일 연속 미운동 시 소멸, 그 전엔 유지.
 * 오늘 미완료여도 오늘이 안 끝났으면 즉시 끊지 않는다 → 날짜 차이로만 판정.
 */

import { dayKey } from "./time";

export const STREAK_EXPIRY_DAYS = 5;

export type StreakStage =
  | "none" // 운동 기록 없음
  | "today_done" // 오늘 완료
  | "d4" // 소멸까지 4일
  | "d3"
  | "d2"
  | "d1" // 오늘 안 하면 내일 소멸
  | "expired"; // 소멸

/** 완료 순간들 → tz 기준 운동일 dayKey 목록 (중복 제거, 오름차순) */
export function workoutDayKeys(instants: Date[], timeZone: string): string[] {
  return [...new Set(instants.map((d) => dayKey(d, timeZone)))].sort();
}

/** "YYYY-MM-DD" 두 날짜의 달력 일수 차이 (to - from) */
function daysBetween(fromKey: string, toKey: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86_400_000);
}

/**
 * 현재 스트릭 = 가장 최근 사슬의 운동일 수.
 * 운동일 사이 간격이 5일 미만이면 사슬이 이어지고,
 * 마지막 운동일로부터 오늘까지 5일 이상 지났으면 소멸(0).
 */
export function currentStreak(dayKeys: string[], todayKey: string): number {
  const keys = [...dayKeys].sort();
  const last = keys.at(-1);
  if (!last || daysBetween(last, todayKey) >= STREAK_EXPIRY_DAYS) return 0;

  let streak = 1;
  for (let i = keys.length - 2; i >= 0; i--) {
    if (daysBetween(keys[i], keys[i + 1]) >= STREAK_EXPIRY_DAYS) break;
    streak++;
  }
  return streak;
}

/**
 * 마지막 운동일로부터 오늘까지의 일수. 기록이 없으면 null.
 * 0 = 오늘 함, 1 = 어제가 마지막(= 오늘만 아직), 2 = 어제는 쉼 …
 */
export function daysSinceLastWorkout(
  dayKeys: string[],
  todayKey: string,
): number | null {
  const last = [...dayKeys].sort().at(-1);
  return last ? daysBetween(last, todayKey) : null;
}

/** 단계 판정: 오늘완료 / D-4 ~ D-1 / 소멸 (§8 6단계 중 카피 제외 판정부) */
export function streakStage(dayKeys: string[], todayKey: string): StreakStage {
  const last = [...dayKeys].sort().at(-1);
  if (!last) return "none";

  const gap = daysBetween(last, todayKey);
  if (gap <= 0) return "today_done";
  if (gap >= STREAK_EXPIRY_DAYS) return "expired";
  // gap 1→d4, 2→d3, 3→d2, 4→d1
  return `d${STREAK_EXPIRY_DAYS - gap}` as StreakStage;
}
