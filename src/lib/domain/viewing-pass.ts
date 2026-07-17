/**
 * 꾸준왕 열람권 도메인 순수 함수 (스펙 2026-07-17-king-viewing-pass).
 * 주(월요일 시작, tz) 5일(고유 날짜) 운동 → 5일째 첫 완료 시각부터
 * 24시간 유효·1회 사용. 서버(0012 view_record)와 같은 판정을 재현한다.
 */

import { dayKey, weekRange } from "./time";

export const KING_DAYS = 5;
export const PASS_HOURS = 24;

export type ViewingPassState = "progress" | "available" | "used" | "expired";

export type ViewingPassStatus = {
  state: ViewingPassState;
  daysDone: number;
  acquiredAt: Date | null; // 5일째를 만든 첫 완료 시각
  expiresAt: Date | null; // acquiredAt + 24h
};

/** 이번 주(tz 월요일 시작) 고유 운동일 dayKey 목록과 5일째 달성 순간 */
export function weekWorkoutDays(
  completedAts: Date[],
  now: Date,
  timeZone: string,
): { days: string[]; fifthAt: Date | null } {
  const { start, end } = weekRange(now, timeZone);
  const inWeek = completedAts
    .filter((d) => d >= start && d < end)
    .sort((a, b) => a.getTime() - b.getTime());

  const seen = new Set<string>();
  let fifthAt: Date | null = null;
  for (const instant of inWeek) {
    const key = dayKey(instant, timeZone);
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size === KING_DAYS && !fifthAt) fifthAt = instant;
  }
  return { days: [...seen].sort(), fifthAt };
}

/** 열람권 상태 — usedViewAts: 내 record_views.viewed_at 목록 */
export function viewingPassStatus(
  completedAts: Date[],
  usedViewAts: Date[],
  now: Date,
  timeZone: string,
): ViewingPassStatus {
  const { days, fifthAt } = weekWorkoutDays(completedAts, now, timeZone);
  if (!fifthAt) {
    return {
      state: "progress",
      daysDone: days.length,
      acquiredAt: null,
      expiresAt: null,
    };
  }
  const expiresAt = new Date(fifthAt.getTime() + PASS_HOURS * 3_600_000);
  if (usedViewAts.some((v) => v >= fifthAt)) {
    return { state: "used", daysDone: days.length, acquiredAt: fifthAt, expiresAt };
  }
  if (now >= expiresAt) {
    return {
      state: "expired",
      daysDone: days.length,
      acquiredAt: fifthAt,
      expiresAt,
    };
  }
  return {
    state: "available",
    daysDone: days.length,
    acquiredAt: fifthAt,
    expiresAt,
  };
}
