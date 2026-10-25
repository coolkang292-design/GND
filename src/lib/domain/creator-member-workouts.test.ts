import { describe, expect, it } from "vitest";
import type { PeriodSessionRow } from "@/lib/challenge";
import { buildMemberWorkoutDays, memberCalendarMonth, summarizeMemberWorkouts } from "./creator-member-workouts";

const set = (o: Partial<PeriodSessionRow["exercises"][number]["sets"][number]>) => ({
  weightKg: null, reps: null, distanceMeters: null, durationSeconds: null, isCompleted: true, ...o,
});
const rows: PeriodSessionRow[] = [
  {
    userId: "m", completedAt: "2026-10-06T10:00:00Z", durationMinutes: 50, // KST 19:00
    exercises: [
      { exerciseType: "weight", exerciseName: "스쿼트", bodyPart: "하체",
        sets: [set({ weightKg: 40, reps: 10 }), set({ weightKg: 50, reps: 8 }), set({ weightKg: 60, reps: 5, isCompleted: false })] },
      { exerciseType: "cardio", exerciseName: "러닝", bodyPart: null,
        sets: [set({ distanceMeters: 3200, durationSeconds: 1500 })] },
    ],
  },
  {
    userId: "m", completedAt: "2026-10-06T23:30:00Z", durationMinutes: 20, // KST 10/7 08:30
    exercises: [
      { exerciseType: "bodyweight", exerciseName: "푸시업", bodyPart: "가슴", sets: [set({ reps: 20 }), set({ reps: 15 })] },
      { exerciseType: "bodyweight", exerciseName: "플랭크", bodyPart: "코어", sets: [set({ durationSeconds: 90 })] },
    ],
  },
  { userId: "m", completedAt: "2026-10-08T10:00:00Z", durationMinutes: null,
    exercises: [{ exerciseType: "weight", exerciseName: "스쿼트", bodyPart: "하체", sets: [set({ weightKg: 55, reps: 8 })] }] },
  { userId: "other", completedAt: "2026-10-06T10:00:00Z", exercises: [] },
];

describe("member workout days (creator member detail)", () => {
  const days = buildMemberWorkoutDays(rows, "m", "Asia/Seoul");

  it("groups this member's sessions by local day, newest day last", () => {
    expect(days.map((d) => d.dayKey)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"]); // 23:30Z → KST 10/7
    expect(days[0].sessions).toHaveLength(1);
  });

  it("summarizes each exercise from completed sets only", () => {
    const [squat, run] = days[0].sessions[0].exercises;
    expect(squat).toMatchObject({ name: "스쿼트", sets: 2, topWeightKg: 50, reps: 18, volumeKg: 800 }); // 40×10 + 50×8
    expect(run).toMatchObject({ name: "러닝", sets: 1, distanceKm: 3.2, minutes: 25 });
    const [pushup, plank] = days[1].sessions[0].exercises;
    expect(pushup).toMatchObject({ reps: 35, volumeKg: 0 });
    expect(plank).toMatchObject({ minutes: 1.5 });
  });

  // 날짜 상세는 피드 카드의 운동 요약 블록을 그대로 쓴다(사용자 지시 2026-10-25) — 그 입력으로 바꾼다.
  it("maps each session to the feed's workout summary input", () => {
    const feed = days[0].sessions[0].feed;
    expect(feed.exerciseNames).toEqual(["스쿼트", "러닝"]);
    expect(feed.durationMinutes).toBe(50);
    expect(feed.breakdown[0].sets).toEqual([
      { weightKg: 40, reps: 10, distanceKm: 0, durationMin: 0, durationSec: 0, done: true },
      { weightKg: 50, reps: 8, distanceKm: 0, durationMin: 0, durationSec: 0, done: true },
      { weightKg: 60, reps: 5, distanceKm: 0, durationMin: 0, durationSec: 0, done: false },
    ]);
    expect(feed.breakdown[1]).toMatchObject({ exerciseType: "cardio", sets: [{ distanceKm: 3.2, durationSec: 1500 }] });
    expect(feed.volume).toMatchObject({ weightVolumeKg: 800, completedSetCount: 3, cardioDistanceMeters: 3200 });
    // 시간만 잰 맨몸 운동은 "time" — 피드가 `1세트 · 총 1분 30초`로 적는다
    expect(days[1].sessions[0].feed.breakdown[1]).toMatchObject({ name: "플랭크", measure: "time" });
    expect(days[1].sessions[0].feed.breakdown[0]).toMatchObject({ name: "푸시업", measure: "reps" });
    // 잰 적 없는 시간은 피드 규약대로 0 → 숫자 줄에서 칸이 빠진다
    expect(days[2].sessions[0].feed.durationMinutes).toBe(0);
    expect(feed).toMatchObject({ sessionId: "", recordNote: null, tabataMinutes: null });
  });

  it("adds day totals and keeps unmeasured duration as null, not 0", () => {
    expect(days[0].totals).toMatchObject({ sessions: 1, sets: 3, volumeKg: 800, distanceKm: 3.2, minutes: 50 });
    expect(days[2].totals.minutes).toBeNull();
  });

  it("summarizes the period: days, top exercises by days, totals", () => {
    const s = summarizeMemberWorkouts(days);
    expect(s).toMatchObject({ days: 3, sessions: 3, volumeKg: 1240, distanceKm: 3.2 });
    expect(s.topExercises[0]).toEqual({ name: "스쿼트", days: 2 });
    expect(s.minutes).toBe(70); // 측정된 것만 더한다
  });

  it("feeds the app's stamp calendar for one month", () => {
    const m = memberCalendarMonth(days, 2026, 10, "Asia/Seoul");
    expect(m.stamps.map((x) => [x.dateKey, x.count])).toEqual([["2026-10-06", 1], ["2026-10-07", 1], ["2026-10-08", 1]]);
    expect(m).toMatchObject({ workoutDays: 3, sessionCount: 3, totalDurationSeconds: 70 * 60, timeZone: "Asia/Seoul" });
    expect(memberCalendarMonth(days, 2026, 11, "Asia/Seoul").workoutDays).toBe(0);
  });
});
