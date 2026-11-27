import { describe, expect, it } from "vitest";
import type { MyChallenge, PeriodSessionRow } from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";
import { forecastWorkout, forecastWorkouts, type ChallengeScoreSnapshot } from "./challenge-workout-impact";
import { hasAssumedTiming, scheduleDaySessions } from "./day-forecast";
import { estimatePlanMinutes } from "./plan-minutes";
import {
  estimateStrengthMinutes,
  estimateWorkoutMinutes,
  minutesBreakdownLabel,
  WORK_SECONDS_PER_SET,
  type HistorySession,
} from "./plan-time-estimate";

/*
  이슈 #33 Phase 2 — 웨이트 예상시간 + 하루 전체 예상 점수.
  점수 기대값은 산식(1일 1점 · 1회 1점 · 60분 1점)에서 바로 나오는 값만 박는다.
  1시간 규칙은 2026-11-22 06:00(KST) 이후 시작한 운동에만 적용되므로 기간을 11월 말로 둔다.
*/
const TZ = "Asia/Seoul";
function goal(type: UserGoal["goal_type"], target = 100, userId = "A"): UserGoal {
  return { id: `${userId}-${type}`, user_id: userId, challenge_id: "ch", group_id: "g", goal_type: type, target_value: target, planned_days: 1, qualifier: null, unit: null, created_at: "", updated_at: "" };
}
function snapshot(goals: UserGoal[] = [goal("weight_reps", 1000)], rows: PeriodSessionRow[] = []): ChallengeScoreSnapshot {
  return {
    challenge: { id: "ch", group_id: "g", name: "test", start_date: "2026-11-27", end_date: "2026-12-03", status: "active", myStatus: "joined", myRole: "member", scoring_version: 2, live_ranking: true } as MyChallenge,
    goals, rows, participantIds: ["A", "B"], timeZone: TZ,
  };
}
const ex = (name: string, type: "weight" | "bodyweight" | "cardio", sets = 1, minutes = 0) => ({
  exerciseName: name, exerciseType: type, bodyPart: "가슴",
  sets: Array.from({ length: sets }, () => ({ weightKg: type === "weight" ? 40 : 0, reps: type === "cardio" ? 0 : 10, durationSeconds: minutes * 60, distanceMeters: 0, isCompleted: true })),
});
/** 11/28(KST) 오전 9시 = 00:00Z */
const at = (hhmm: string) => Date.parse(`2026-11-28T${hhmm}:00+09:00`);
const plan = (startMs: number, minutes: number, exercises = [ex("벤치프레스", "weight", 3)]): PeriodSessionRow => ({
  userId: "A", startedAt: new Date(startMs).toISOString(), completedAt: new Date(startMs + minutes * 60_000).toISOString(),
  tabataMinutes: null, durationMinutes: minutes, exercises,
});
const cents = (n: number) => Math.round(n * 100);

describe("TASK-05 기존 산식 그대로 — 시간 점수", () => {
  it("T11 유산소 30분 → 60분이면 활동 시간 점수가 +0.50", () => {
    const s = snapshot([goal("weight_reps", 1000)], [plan(at("07:00"), 10)]);
    const minutes = (m: number) => estimatePlanMinutes(null, [{ exerciseType: "cardio", sets: [{ durationSeconds: m * 60 }] }]).minutes;
    const thirty = forecastWorkout(s, "A", plan(at("12:00"), minutes(30), [ex("러닝", "cardio", 1, 30)]))!;
    const sixty = forecastWorkout(s, "A", plan(at("12:00"), minutes(60), [ex("러닝", "cardio", 1, 60)]))!;
    expect(cents(sixty.activityParts.minutes) - cents(thirty.activityParts.minutes)).toBe(50);
  });

  it("T12 웨이트 30분(최근 같은 구성 기록) + 유산소 30분 → 시간 점수 1.00", () => {
    const routine = () => [ex("벤치프레스", "weight", 4), ex("바벨 로우", "weight", 4), ex("스쿼트", "weight", 4)];
    const history: HistorySession[] = [
      { completedAt: "2026-11-20T10:00:00Z", durationMinutes: 30, tabataMinutes: null, exercises: routine() },
    ];
    const exercises = [...routine(), ex("러닝", "cardio", 1, 30)];
    const estimate = estimateWorkoutMinutes({ exercises, history, restSeconds: 90 });
    expect(estimate.strength).toEqual({ minutes: 30, basis: "same-routine", sets: 12 });
    expect(estimate.totalMinutes).toBe(60);
    const f = forecastWorkout(snapshot(), "A", plan(at("12:00"), estimate.totalMinutes, exercises))!;
    expect(f.activityParts.minutes).toBe(1);
  });
});

describe("TASK-06 웨이트·맨몸 예상시간", () => {
  const bench3 = [ex("벤치프레스", "weight", 3)];

  it("1순위: 같은 종목 구성의 실제 시간 — 세트 수가 다르면 비율로", () => {
    const history: HistorySession[] = [
      { completedAt: "2026-11-25T10:00:00Z", durationMinutes: 20, tabataMinutes: null, exercises: [ex("벤치프레스", "weight", 4)] },
    ];
    expect(estimateStrengthMinutes({ exercises: bench3, history, restSeconds: 90 })).toEqual({ minutes: 15, basis: "same-routine", sets: 3 });
  });

  it("지난 총시간에서 유산소·인터벌을 빼고 웨이트 몫만 쓴다 — 이중 계산 방지", () => {
    const history: HistorySession[] = [
      // 총 50분 = 인터벌 8 + 유산소 30 + 웨이트 12
      { completedAt: "2026-11-25T10:00:00Z", durationMinutes: 50, tabataMinutes: 8, exercises: [
        ex("버피", "bodyweight"), ex("점프 스쿼트", "bodyweight"), ex("마운틴 클라이머", "bodyweight"), ex("하이 니", "bodyweight"),
        ex("벤치프레스", "weight", 3), ex("러닝", "cardio", 1, 30),
      ] },
    ];
    expect(estimateStrengthMinutes({ exercises: bench3, history, restSeconds: 90 })).toEqual({ minutes: 12, basis: "same-routine", sets: 3 });
  });

  it("2순위: 구성이 다르면 최근 운동의 세트당 시간(중앙값) × 세트 수", () => {
    const history: HistorySession[] = [
      { completedAt: "2026-11-25T10:00:00Z", durationMinutes: 20, tabataMinutes: null, exercises: [ex("스쿼트", "weight", 5)] }, // 4분/세트
      { completedAt: "2026-11-24T10:00:00Z", durationMinutes: 10, tabataMinutes: null, exercises: [ex("데드리프트", "weight", 5)] }, // 2분/세트
      { completedAt: "2026-11-23T10:00:00Z", durationMinutes: 15, tabataMinutes: null, exercises: [ex("로우", "weight", 5)] }, // 3분/세트
    ];
    expect(estimateStrengthMinutes({ exercises: bench3, history, restSeconds: 90 })).toEqual({ minutes: 9, basis: "similar", sets: 3 });
  });

  it("믿기 어려운 기록(세트당 8분 초과 — 앱을 켜 둔 채 잊음)은 쓰지 않는다", () => {
    const history: HistorySession[] = [
      { completedAt: "2026-11-25T10:00:00Z", durationMinutes: 300, tabataMinutes: null, exercises: [ex("벤치프레스", "weight", 3)] },
    ];
    expect(estimateStrengthMinutes({ exercises: bench3, history, restSeconds: 90 })?.basis).toBe("default");
  });

  it("3순위: 기록이 없으면 세트당 (운동 40초 + 휴식)", () => {
    const r = estimateStrengthMinutes({ exercises: bench3, history: [], restSeconds: 90 })!;
    expect(r.basis).toBe("default");
    expect(r.minutes).toBe(Math.round((((WORK_SECONDS_PER_SET + 90) / 60) * 3) * 10) / 10);
  });

  it("웨이트·맨몸이 없으면 추정하지 않는다 (유산소·인터벌만)", () => {
    expect(estimateStrengthMinutes({ exercises: [ex("러닝", "cardio", 1, 30)], history: [], restSeconds: 90 })).toBeNull();
  });

  it("목록 중간의 인터벌 블록은 웨이트로 세지 않는다 (시작 위치를 따른다)", () => {
    const list = [ex("벤치프레스", "weight", 3), ex("버피", "bodyweight"), ex("점프 스쿼트", "bodyweight"), ex("마운틴 클라이머", "bodyweight"), ex("하이 니", "bodyweight")];
    const r = estimateWorkoutMinutes({ exercises: list, tabataMinutes: 4, intervalStartIndex: 1, history: [], restSeconds: 90 });
    expect(r.strength?.sets).toBe(3);
    expect(r.intervalMinutes).toBe(4);
    expect(minutesBreakdownLabel({ intervalMinutes: 4, cardioMinutes: 60, strengthMinutes: r.strength!.minutes })).toBe("웨이트 약 7분 · 유산소 60분 · 인터벌 4분");
  });
});

describe("TASK-07 하루 전체 예상 점수 — 가상 완료 행을 한꺼번에 계산기에 넣는다", () => {
  it("T13 같은 날 2회: 운동한 날은 한 번만 (+1.00), 각자 더하면 +2.00이 된다", () => {
    const s = snapshot();
    const a = plan(at("09:00"), 30);
    const b = plan(at("18:00"), 30);
    const day = forecastWorkouts(s, "A", [a, b])!;
    expect(day.activityParts.days).toBe(1);
    expect(day.activityParts.sessions).toBe(2); // 9시간 간격이라 둘 다 인정
    const naive = forecastWorkout(s, "A", a)!.activityParts.days + forecastWorkout(s, "A", b)!.activityParts.days;
    expect(naive).toBe(2);
  });

  it("T14 인정 운동이 끝나고 59분 뒤 시작: 횟수 미가산, 시간은 반영", () => {
    const s = snapshot();
    const first = plan(at("09:00"), 30);
    const second = plan(at("09:30") + 59 * 60_000, 30);
    const day = forecastWorkouts(s, "A", [first, second])!;
    expect(day.activityParts.sessions).toBe(1);
    expect(day.uncountedCount).toBe(1);
    expect(day.sessionCounted).toBe(false);
    expect(day.activityParts.minutes).toBe(1); // 30 + 30분
  });

  it("T15 정확히 60분 뒤 시작: 횟수 1회 가산", () => {
    const s = snapshot();
    const first = plan(at("09:00"), 30);
    const second = plan(at("09:30") + 60 * 60_000, 30);
    const day = forecastWorkouts(s, "A", [first, second])!;
    expect(day.activityParts.sessions).toBe(2);
    expect(day.uncountedCount).toBe(0);
  });

  it("오늘 이미 끝낸 운동 뒤 1시간 안이면 남은 계획은 횟수에 안 들어간다", () => {
    const done: PeriodSessionRow = { ...plan(at("09:00"), 30), sessionId: "done" };
    const s = snapshot([goal("weight_reps", 1000)], [done]);
    const day = forecastWorkouts(s, "A", [plan(at("09:50"), 30)])!;
    expect(day.activityParts.sessions).toBe(0);
    expect(day.activityParts.days).toBe(0); // 오늘은 이미 운동한 날
  });

  it("T22 목표 상한·완료 보너스·운동일이 겹쳐 세지지 않는다 — 합친 계산 ≤ 각자 더한 값", () => {
    const s = snapshot([goal("weight_reps", 40), goal("workout_days", 1)]);
    const a = plan(at("09:00"), 30); // 30회
    const b = plan(at("18:00"), 30); // 30회 — 목표 40회를 넘긴다
    const day = forecastWorkouts(s, "A", [a, b])!;
    const sum = forecastWorkout(s, "A", a)!.delta + forecastWorkout(s, "A", b)!.delta;
    expect(day.delta).toBeLessThan(sum);
    expect(day.afterScore).toBeLessThanOrEqual(110); // 기본 점수 상한(달성률 100% + 완료 보너스) 안
    expect(cents(day.activityParts.days) + cents(day.activityParts.sessions) + cents(day.activityParts.minutes)).toBe(cents(day.activityDelta));
  });

  it("계획 하나면 예전 단일 예상과 같다 (forecastWorkout 회귀)", () => {
    const s = snapshot();
    const a = plan(at("09:00"), 30);
    const { uncountedCount, ...day } = forecastWorkouts(s, "A", [a])!;
    expect(uncountedCount).toBe(0);
    expect(day).toEqual(forecastWorkout(s, "A", a));
  });

  it("예상 계산은 실제 기록 행을 바꾸지 않는다", () => {
    const s = snapshot([goal("weight_reps", 1000)], [{ ...plan(at("07:00"), 20), sessionId: "real" }]);
    const before = JSON.stringify(s.rows);
    forecastWorkouts(s, "A", [plan(at("09:00"), 30), plan(at("18:00"), 30)]);
    expect(JSON.stringify(s.rows)).toBe(before);
  });
});

describe("시간표 — 예정 시각을 쓰고, 모르면 보수적으로", () => {
  const now = at("10:00");

  it("첫 운동은 예정 시각(미래)에, 없거나 지났으면 지금 시작한다", () => {
    expect(scheduleDaySessions(now, [{ item: "q", minutes: 30, scheduledAtMs: at("12:00") }])[0]).toMatchObject({ startMs: at("12:00"), timing: "scheduled" });
    expect(scheduleDaySessions(now, [{ item: "q", minutes: 30, scheduledAtMs: at("08:00") }])[0]).toMatchObject({ startMs: now, timing: "now" });
    expect(scheduleDaySessions(now, [{ item: "q", minutes: 30, scheduledAtMs: null }])[0]).toMatchObject({ startMs: now, endMs: now + 30 * 60_000 });
  });

  it("예정이 없는 다음 운동은 바로 이어서 한다고 본다 — 횟수를 보수적으로", () => {
    const timed = scheduleDaySessions(now, [
      { item: "q", minutes: 30, scheduledAtMs: null },
      { item: "p", minutes: 20, scheduledAtMs: null },
    ]);
    expect(timed[1]).toMatchObject({ startMs: now + 30 * 60_000, timing: "after-previous" });
    expect(hasAssumedTiming(timed)).toBe(true);
    const day = forecastWorkouts(snapshot(), "A", timed.map((t) => plan(t.startMs, t.minutes)))!;
    expect(day.uncountedCount).toBe(1);
  });

  it("앞 운동과 겹치는 예정은 앞 운동이 끝난 직후로 민다", () => {
    const timed = scheduleDaySessions(now, [
      { item: "q", minutes: 60, scheduledAtMs: null },
      { item: "p", minutes: 20, scheduledAtMs: at("10:30") },
    ]);
    expect(timed[1]).toMatchObject({ startMs: at("11:00"), timing: "overlap" });
  });

  it("넉넉한 간격의 예정이면 그대로 — 조건 안내 없음", () => {
    const timed = scheduleDaySessions(now, [
      { item: "q", minutes: 30, scheduledAtMs: null },
      { item: "p", minutes: 20, scheduledAtMs: at("19:00") },
    ]);
    expect(timed[1].timing).toBe("scheduled");
    expect(hasAssumedTiming(timed)).toBe(false);
  });
});
