import { describe, expect, it } from "vitest";
import {
  GOAL_TYPE_META,
  actualForGoal,
  foldPeriodStats,
  goalLabel,
  type PeriodSessionRow,
  type PeriodStats,
} from "@/lib/challenge";

const STATS: PeriodStats = {
  workoutDays: 5,
  workoutDayKeys: [
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
    "2026-07-04",
    "2026-07-05",
  ],
  weightReps: 240,
  volumeKg: 3000,
  cardioDistanceKm: 12,
  cardioTimeMin: 90,
  bodyweightReps: 180,
  bodyweightTimeMin: 24,
  weightPartsByDay: { "2026-07-01": 3, "2026-07-02": 1, "2026-07-03": 4 },
  bodyweightKindsByDay: { "2026-07-01": 2, "2026-07-04": 3 },
};

describe("goalLabel", () => {
  it("weight_days는 부위 조건을 붙인다", () => {
    expect(goalLabel("weight_days", 3)).toBe("웨이트 운동일(하루 3부위+)");
  });
  it("bodyweight_days는 종목 조건을 붙인다", () => {
    expect(goalLabel("bodyweight_days", 2)).toBe("맨몸 운동일(하루 2종목+)");
  });
  it("일반 지표는 라벨 그대로", () => {
    expect(goalLabel("weight_reps")).toBe(GOAL_TYPE_META.weight_reps.label);
  });
});

describe("actualForGoal", () => {
  it("weight_reps", () => expect(actualForGoal(STATS, "weight_reps")).toBe(240));
  it("cardio_distance", () =>
    expect(actualForGoal(STATS, "cardio_distance")).toBe(12));
  it("cardio_time", () => expect(actualForGoal(STATS, "cardio_time")).toBe(90));
  it("bodyweight_reps", () =>
    expect(actualForGoal(STATS, "bodyweight_reps")).toBe(180));
  it("bodyweight_time", () =>
    expect(actualForGoal(STATS, "bodyweight_time")).toBe(24));
  it("weight_days는 N부위+ 인 날만 센다", () => {
    expect(actualForGoal(STATS, "weight_days", 3)).toBe(2); // 3,4 부위인 날 2개
  });
  it("bodyweight_days는 N종목+ 인 날만 센다", () => {
    expect(actualForGoal(STATS, "bodyweight_days", 3)).toBe(1); // 3종목인 날 1개
  });
  it("volume은 레거시 볼륨", () =>
    expect(actualForGoal(STATS, "volume")).toBe(3000));
});

describe("foldPeriodStats", () => {
  const rows: PeriodSessionRow[] = [
    {
      userId: "u1",
      completedAt: "2026-07-01T02:00:00Z", // KST 07-01 11시
      exercises: [
        {
          exerciseType: "weight",
          exerciseName: "벤치프레스",
          bodyPart: "가슴",
          sets: [
            { weightKg: 60, reps: 10, distanceMeters: null, durationSeconds: null, isCompleted: true },
            { weightKg: 60, reps: 8, distanceMeters: null, durationSeconds: null, isCompleted: false },
          ],
        },
        {
          exerciseType: "bodyweight",
          exerciseName: "매달리기",
          bodyPart: "등",
          sets: [
            { weightKg: null, reps: null, distanceMeters: null, durationSeconds: 180, isCompleted: true },
          ],
        },
        {
          exerciseType: "bodyweight",
          exerciseName: "푸시업",
          bodyPart: "가슴",
          sets: [
            { weightKg: null, reps: 20, distanceMeters: null, durationSeconds: null, isCompleted: true },
          ],
        },
        {
          exerciseType: "cardio",
          exerciseName: "러닝",
          bodyPart: "유산소",
          sets: [
            { weightKg: null, reps: null, distanceMeters: 5000, durationSeconds: 1800, isCompleted: true },
          ],
        },
      ],
    },
  ];

  it("카테고리별 완료 세트만 집계한다", () => {
    const m = foldPeriodStats(rows, "2026-07-01", "2026-07-31", "Asia/Seoul");
    const s = m.get("u1")!;
    expect(s.workoutDays).toBe(1);
    expect(s.weightReps).toBe(10); // 완료 세트만 (8은 미완료)
    expect(s.volumeKg).toBe(600);
    expect(s.bodyweightReps).toBe(20); // 푸시업
    expect(s.bodyweightTimeMin).toBe(3); // 매달리기 180초=3분
    expect(s.cardioDistanceKm).toBe(5);
    expect(s.cardioTimeMin).toBe(30);
    expect(s.weightPartsByDay["2026-07-01"]).toBe(1); // 가슴 1부위
    expect(s.bodyweightKindsByDay["2026-07-01"]).toBe(2); // 매달리기·푸시업
  });

  it("기간 밖(tz 기준) 세션은 제외", () => {
    const m = foldPeriodStats(rows, "2026-07-02", "2026-07-31", "Asia/Seoul");
    expect(m.get("u1")).toBeUndefined();
  });
});

describe("foldPeriodStats - workoutDayKeys (레벨 재료)", () => {
  const row = (userId: string, completedAt: string): PeriodSessionRow => ({
    userId,
    completedAt,
    exercises: [],
  });

  it("기간 내 운동일을 오름차순 dayKey 배열로 노출한다 (중복 세션은 1일)", () => {
    const stats = foldPeriodStats(
      [
        row("u1", "2026-07-03T10:00:00+09:00"),
        row("u1", "2026-07-01T09:00:00+09:00"),
        row("u1", "2026-07-01T20:00:00+09:00"),
        row("u1", "2026-06-30T10:00:00+09:00"),
      ],
      "2026-07-01",
      "2026-07-28",
      "Asia/Seoul",
    );

    expect(stats.get("u1")!.workoutDayKeys).toEqual([
      "2026-07-01",
      "2026-07-03",
    ]);
    expect(stats.get("u1")!.workoutDays).toBe(2);
  });
});
