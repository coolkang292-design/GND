import { describe, expect, it } from "vitest";
import {
  GOAL_TYPE_META,
  actualForGoal,
  goalLabel,
  type PeriodStats,
} from "@/lib/challenge";

const STATS: PeriodStats = {
  workoutDays: 5,
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
