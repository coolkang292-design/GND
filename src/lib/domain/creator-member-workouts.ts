import type { PeriodSessionRow } from "@/lib/challenge";
import type { DayStamp } from "@/lib/domain/calendar";
import type { PublicCrewMonth } from "@/lib/domain/crew-calendar";
import type { WorkoutSummaryInput } from "@/lib/domain/feed-card";
import { summarizeVolume } from "@/lib/domain/volume";
import { dayKey } from "@/lib/domain/time";

/**
 * 참여자 상세의 "어떤 날 어떤 운동을 했나" (사용자 요청 2026-10-25).
 *
 * 재료는 방장이 이미 읽는 `get_challenge_period_sessions` 행뿐이다 — **챌린지에 반영된**
 * 세션(사진 필수 방이면 사진 있는 것)만 들어온다. 회원의 다른 운동·비공개 기록은 보지 않는다.
 * 세트는 **완료한 것만** 센다(`isCompleted`). 잰 적 없는 시간은 0이 아니라 null.
 */
export type ExerciseSummary = {
  name: string;
  type: "weight" | "bodyweight" | "cardio";
  bodyPart: string | null;
  sets: number;
  reps: number;
  topWeightKg: number | null;
  volumeKg: number;
  distanceKm: number;
  minutes: number;
};

export type SessionSummary = {
  at: string;
  /** 현지 "HH:MM" */
  time: string;
  durationMinutes: number | null;
  exercises: ExerciseSummary[];
  /** 피드 카드의 운동 요약 블록 입력 — 날짜 상세는 그 블록을 그대로 쓴다(2026-10-25) */
  feed: WorkoutSummaryInput;
};

export type DayTotals = {
  sessions: number;
  sets: number;
  volumeKg: number;
  distanceKm: number;
  /** 세션 시간 합 — 하나도 잰 적 없으면 null */
  minutes: number | null;
};

export type MemberWorkoutDay = { dayKey: string; sessions: SessionSummary[]; totals: DayTotals };

const round1 = (n: number) => Math.round(n * 10) / 10;

function summarizeExercise(e: PeriodSessionRow["exercises"][number]): ExerciseSummary {
  const done = e.sets.filter((s) => s.isCompleted);
  const weights = done.map((s) => s.weightKg).filter((w): w is number => w !== null && w > 0);
  return {
    name: e.exerciseName,
    type: e.exerciseType,
    bodyPart: e.bodyPart,
    sets: done.length,
    reps: done.reduce((n, s) => n + (s.reps ?? 0), 0),
    topWeightKg: weights.length ? Math.max(...weights) : null,
    volumeKg: done.reduce((n, s) => n + (s.weightKg ?? 0) * (s.reps ?? 0), 0),
    distanceKm: round1(done.reduce((n, s) => n + (s.distanceMeters ?? 0), 0) / 1000),
    minutes: round1(done.reduce((n, s) => n + (s.durationSeconds ?? 0), 0) / 60),
  };
}

/**
 * 챌린지 세션 행 → 피드 운동 요약 입력. 피드의 `toFeedBreakdown`·`summarizeVolume`과 같은 규칙.
 * 세션 id·기록 갱신 문구는 이 RPC가 주지 않는다 → 빈 값(따라하기·기록 갱신 줄이 안 그려진다).
 */
export function toWorkoutSummaryInput(row: PeriodSessionRow, nickname: string): WorkoutSummaryInput {
  return {
    sessionId: "",
    nickname,
    durationMinutes: row.durationMinutes ?? 0,
    exerciseNames: row.exercises.map((e) => e.exerciseName),
    recordNote: null,
    tabataMinutes: row.tabataMinutes ?? null,
    volume: summarizeVolume(
      row.exercises.flatMap((e) => e.sets.map((set) => ({ ...set, exerciseType: e.exerciseType }))),
    ),
    breakdown: row.exercises.map((e) => ({
      name: e.exerciseName,
      exerciseType: e.exerciseType,
      // 이 RPC엔 measure가 없다 — 시간만 잰 맨몸 운동(플랭크)을 "time"으로 되살린다
      measure:
        e.exerciseType === "bodyweight"
          ? e.sets.some((x) => (x.durationSeconds ?? 0) > 0) && !e.sets.some((x) => (x.reps ?? 0) > 0) ? "time" : "reps"
          : null,
      sets: e.sets.map((set) => ({
        weightKg: Number(set.weightKg ?? 0),
        reps: set.reps ?? 0,
        distanceKm: (set.distanceMeters ?? 0) / 1000,
        durationMin: Math.round((set.durationSeconds ?? 0) / 60),
        durationSec: set.durationSeconds ?? 0,
        done: set.isCompleted,
      })),
    })),
  };
}

export function buildMemberWorkoutDays(
  rows: readonly PeriodSessionRow[],
  userId: string,
  timeZone: string,
  nickname = "",
): MemberWorkoutDay[] {
  const clock = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  const byDay = new Map<string, SessionSummary[]>();
  for (const r of rows) {
    if (r.userId !== userId) continue;
    const at = new Date(r.completedAt);
    const key = dayKey(at, timeZone);
    const list = byDay.get(key) ?? [];
    list.push({
      at: r.completedAt,
      time: clock.format(at),
      durationMinutes: r.durationMinutes ?? null,
      exercises: r.exercises.map(summarizeExercise),
      feed: toWorkoutSummaryInput(r, nickname),
    });
    byDay.set(key, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, sessions]) => {
      sessions.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      const all = sessions.flatMap((s) => s.exercises);
      const measured = sessions.map((s) => s.durationMinutes).filter((m): m is number => m !== null);
      return {
        dayKey: key,
        sessions,
        totals: {
          sessions: sessions.length,
          sets: all.reduce((n, e) => n + e.sets, 0),
          volumeKg: all.reduce((n, e) => n + e.volumeKg, 0),
          distanceKm: round1(all.reduce((n, e) => n + e.distanceKm, 0)),
          minutes: measured.length ? measured.reduce((a, b) => a + b, 0) : null,
        },
      };
    });
}

export type MemberWorkoutSummary = {
  days: number;
  sessions: number;
  minutes: number | null;
  volumeKg: number;
  distanceKm: number;
  /** 가장 여러 날 한 운동 — 이름이 같으면 같은 운동 */
  topExercises: { name: string; days: number }[];
};

export function summarizeMemberWorkouts(days: readonly MemberWorkoutDay[]): MemberWorkoutSummary {
  const exerciseDays = new Map<string, number>();
  for (const d of days) {
    for (const name of new Set(d.sessions.flatMap((s) => s.exercises.map((e) => e.name)))) {
      exerciseDays.set(name, (exerciseDays.get(name) ?? 0) + 1);
    }
  }
  const measured = days.map((d) => d.totals.minutes).filter((m): m is number => m !== null);
  return {
    days: days.length,
    sessions: days.reduce((n, d) => n + d.totals.sessions, 0),
    minutes: measured.length ? measured.reduce((a, b) => a + b, 0) : null,
    volumeKg: days.reduce((n, d) => n + d.totals.volumeKg, 0),
    distanceKm: round1(days.reduce((n, d) => n + d.totals.distanceKm, 0)),
    topExercises: [...exerciseDays.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
      .slice(0, 3)
      .map(([name, n]) => ({ name, days: n })),
  };
}

/** 앱의 도장 달력(`CrewCalendarMonthView`)이 받는 모양으로 한 달을 만든다. */
export function memberCalendarMonth(
  days: readonly MemberWorkoutDay[],
  year: number,
  month: number,
  timeZone: string,
): PublicCrewMonth & { timeZone: string } {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const stamps: DayStamp[] = days
    .filter((d) => d.dayKey.startsWith(prefix))
    .map((d) => ({
      dateKey: d.dayKey,
      count: d.totals.sessions,
      verification: "none",
      totalDurationSeconds: (d.totals.minutes ?? 0) * 60,
    }));
  return {
    stamps,
    workoutDays: stamps.length,
    sessionCount: stamps.reduce((n, s) => n + s.count, 0),
    totalDurationSeconds: stamps.reduce((n, s) => n + s.totalDurationSeconds, 0),
    timeZone,
  };
}
