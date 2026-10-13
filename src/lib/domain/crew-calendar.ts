/**
 * 크루 프로필의 공개 운동 달력 — 서버 저장 없이 기존 완료 세션에서 파생한다.
 * 본인 기록 달력과 동일한 computeDayStamps / sessionsInMonth를 재사용한다.
 * 예정 운동은 크루에게 공개되지 않으므로 집계하지 않는다.
 */
import {
  computeDayStamps,
  sessionsInMonth,
  type CompletedSession,
  type DayStamp,
} from "@/lib/domain/calendar";

export type PublicCrewMonth = {
  stamps: DayStamp[];
  workoutDays: number;
  sessionCount: number;
  totalDurationSeconds: number;
};

export function summarizePublicCrewMonth(
  sessions: CompletedSession[],
  timeZone: string,
  year: number,
  month: number,
): PublicCrewMonth {
  const matching = sessionsInMonth(sessions, timeZone, year, month);
  const stamps = computeDayStamps(matching, timeZone);
  return {
    stamps,
    workoutDays: stamps.length,
    sessionCount: matching.length,
    totalDurationSeconds: matching.reduce((n, s) => n + s.durationSeconds, 0),
  };
}
