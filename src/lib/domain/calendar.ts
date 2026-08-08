/**
 * 달력 도메인 순수 함수 (§12 calendar.ts).
 * 스탬프는 저장하지 않고 파생 — completed 세션의 completed_at을 사용자 tz로 날짜화해 집계.
 * 모든 날짜 판정은 사용자 timezone 기준(자정·월·연 경계 포함).
 */

import { dayKey } from "./time";

export type Verification = "camera_verified" | "photo_uploaded" | "none";

export type CompletedSession = {
  completedAt: Date; // 완료 순간 (UTC, 서버시간)
  verification: Verification;
  durationSeconds: number;
};

export type DayStamp = {
  dateKey: string; // "YYYY-MM-DD" (사용자 tz)
  count: number; // 그날 완료 세션 수
  verification: Verification; // 그날 가장 높은 인증 등급
  totalDurationSeconds: number;
};

export type MonthlySummary = {
  workoutDayCount: number; // 운동한 날 수 (중복 제거)
  sessionCount: number;
  totalDurationSeconds: number;
  daysInMonth: number;
  /** 0~1. `null` = 주간 기준이 없다 (진행 중 챌린지가 없다) */
  achievementRate: number | null;
};

const VERIFICATION_RANK: Record<Verification, number> = {
  none: 0,
  photo_uploaded: 1,
  camera_verified: 2,
};

/** 두 인증 등급 중 높은 쪽 */
function higherVerification(a: Verification, b: Verification): Verification {
  return VERIFICATION_RANK[a] >= VERIFICATION_RANK[b] ? a : b;
}

/** completed 세션들 → tz 기준 날짜별 스탬프 (날짜 오름차순) */
export function computeDayStamps(
  sessions: CompletedSession[],
  timeZone: string,
): DayStamp[] {
  const byDate = new Map<string, DayStamp>();
  for (const s of sessions) {
    const dateKey = dayKey(s.completedAt, timeZone);
    const existing = byDate.get(dateKey);
    if (existing) {
      existing.count++;
      existing.totalDurationSeconds += s.durationSeconds;
      existing.verification = higherVerification(
        existing.verification,
        s.verification,
      );
    } else {
      byDate.set(dateKey, {
        dateKey,
        count: 1,
        verification: s.verification,
        totalDurationSeconds: s.durationSeconds,
      });
    }
  }
  return [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** tz 기준 특정 (year, month=1~12)에 속하는 세션만 */
export function sessionsInMonth<T extends { completedAt: Date }>(
  sessions: T[],
  timeZone: string,
  year: number,
  month: number,
): T[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return sessions.filter((s) => dayKey(s.completedAt, timeZone).startsWith(prefix));
}

/** tz 기준 특정 날짜("YYYY-MM-DD")의 세션만 (상세 시트·지난 운동 복사용) */
export function sessionsOnDay<T extends { completedAt: Date }>(
  sessions: T[],
  timeZone: string,
  dateKey: string,
): T[] {
  return sessions.filter((s) => dayKey(s.completedAt, timeZone) === dateKey);
}

/** 그레고리력 월 일수 (tz 무관) */
function daysInGregorianMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 월간 요약 — 달성률은 주간목표를 그 달 일수로 환산한 기대 운동일 대비 (1.0 상한)
 *
 * ⚠️ `weeklyGoal`이 `null`이면 `achievementRate`도 `null`이다 — **0이 아니다.**
 * 2026-08-08부터 주간 기준은 진행 중 챌린지에서 오고, 챌린지가 없으면 기준 자체가
 * 없다. 0으로 만들면 화면에 `0%`가 떠서 "다 못 했다"로 읽힌다. 아무도 목표를
 * 안 정했을 뿐인데 실패한 것처럼 보이는 것이 이 작업이 없애려던 상태다.
 */
export function summarizeMonth(
  sessions: CompletedSession[],
  timeZone: string,
  year: number,
  month: number,
  weeklyGoal: number | null,
): MonthlySummary {
  const inMonth = sessionsInMonth(sessions, timeZone, year, month);
  const stamps = computeDayStamps(inMonth, timeZone);
  const daysInMonth = daysInGregorianMonth(year, month);

  const workoutDayCount = stamps.length;
  const totalDurationSeconds = inMonth.reduce(
    (sum, s) => sum + s.durationSeconds,
    0,
  );

  const expectedDays = weeklyGoal === null ? 0 : (weeklyGoal / 7) * daysInMonth;
  const achievementRate =
    weeklyGoal === null
      ? null
      : expectedDays > 0
        ? Math.min(1, workoutDayCount / expectedDays)
        : 0;

  return {
    workoutDayCount,
    sessionCount: inMonth.length,
    totalDurationSeconds,
    daysInMonth,
    achievementRate,
  };
}
