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
  /** 완료일 + 미완료 계획일. 같은 날짜는 한 번만 센다. */
  monthlyTargetDayCount: number;
  remainingPlanDayCount: number;
  /** 0~1. `null` = 해당 월에 완료 기록도 계획도 없다. */
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
 * 선택 월의 기록·계획만 집계한다. 완료율 = 완료 운동일 / (완료일 ∪ 계획일).
 * 완료 후 계획이 삭제되므로 완료일도 분모에 보존한다. 같은 날의 여러 기록·계획은
 * 한 운동일이다. 계획 없이 한 운동도 완료일로 포함되며, 과거 미완료·미래 계획 모두
 * 남은 계획일에 포함한다. 엄밀한 원래 계획 준수율이 아니라 현재 월 일정의 진행률이다.
 */
export function summarizeMonth(
  sessions: CompletedSession[],
  timeZone: string,
  year: number,
  month: number,
  plans: readonly { planDate: string }[],
): MonthlySummary {
  const inMonth = sessionsInMonth(sessions, timeZone, year, month);
  const stamps = computeDayStamps(inMonth, timeZone);
  const daysInMonth = daysInGregorianMonth(year, month);

  const workoutDayCount = stamps.length;
  const totalDurationSeconds = inMonth.reduce(
    (sum, s) => sum + s.durationSeconds,
    0,
  );

  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const targetDates = new Set(stamps.map((stamp) => stamp.dateKey));
  for (const plan of plans) {
    if (plan.planDate.startsWith(prefix)) targetDates.add(plan.planDate);
  }
  const monthlyTargetDayCount = targetDates.size;
  const remainingPlanDayCount = monthlyTargetDayCount - workoutDayCount;
  const achievementRate = monthlyTargetDayCount > 0
    ? workoutDayCount / monthlyTargetDayCount
    : null;

  return {
    workoutDayCount,
    sessionCount: inMonth.length,
    totalDurationSeconds,
    daysInMonth,
    monthlyTargetDayCount,
    remainingPlanDayCount,
    achievementRate,
  };
}
