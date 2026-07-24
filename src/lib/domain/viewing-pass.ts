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

// ── 챌린지 크루 성과 열람권: 엄밀 연속 5일 + 2시간 (D1·D3) ──────

export const CHALLENGE_PASS_HOURS = 2;

/** todayKey에서 하루씩 뒤로 가며 dayKey를 만든다 (월 경계 안전, UTC 산술) */
function dayKeyBack(todayKey: string, back: number): string {
  const [y, m, d] = todayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - back));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** 오늘(todayKey) 포함 최근 n일 캘린더 날짜가 모두 운동일이면 true */
export function hasConsecutiveWorkoutDays(
  dayKeys: string[],
  todayKey: string,
  n: number,
): boolean {
  const set = new Set(dayKeys);
  for (let i = 0; i < n; i++) {
    if (!set.has(dayKeyBack(todayKey, i))) return false;
  }
  return true;
}

export type ChallengePassState =
  | "locked_progress"
  | "unlocked"
  | "locked_expired";

export type ChallengePassStatus = {
  state: ChallengePassState;
  consecutiveDays: number; // 오늘부터 뒤로 이어진 연속 운동일 수
  fifthAt: Date | null; // 5일 연속을 만든(=오늘 5일째) 첫 완료 시각
  expiresAt: Date | null; // fifthAt + 2h
};

/** 연속 5일 달성 시각부터 2시간 공개. completedAts=내 완료 시각 목록 */
export function challengePassStatus(
  completedAts: Date[],
  now: Date,
  timeZone: string,
  requiredDays = KING_DAYS, // 5
): ChallengePassStatus {
  const keys = new Set(completedAts.map((d) => dayKey(d, timeZone)));
  const todayKey = dayKey(now, timeZone);
  // 오늘부터 뒤로 연속 일수
  let consecutive = 0;
  for (let i = 0; ; i++) {
    if (keys.has(dayKeyBack(todayKey, i))) consecutive++;
    else break;
  }
  if (consecutive < requiredDays) {
    return {
      state: "locked_progress",
      consecutiveDays: consecutive,
      fifthAt: null,
      expiresAt: null,
    };
  }
  // 오늘 완료들 중 첫 시각 = 5일째를 만든 시각
  const todays = completedAts
    .filter((dt) => dayKey(dt, timeZone) === todayKey)
    .sort((a, b) => a.getTime() - b.getTime());
  const fifthAt = todays[0] ?? now;
  const expiresAt = new Date(
    fifthAt.getTime() + CHALLENGE_PASS_HOURS * 3_600_000,
  );
  return {
    state: now >= expiresAt ? "locked_expired" : "unlocked",
    consecutiveDays: consecutive,
    fifthAt,
    expiresAt,
  };
}
