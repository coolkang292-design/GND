import { describe, expect, it } from "vitest";
import {
  completeOrderedInterval,
  intervalBlockStart,
  isOrderedIntervalExercise,
  orderedExerciseKeys,
  validateOrderedWorkoutPlan,
  type OrderedWorkoutPlan,
} from "./unified-workout-session";

const interval = { kind: "interval" as const, keys: ["a", "b", "c", "d"] as const };

describe("통합 운동 세션 순서", () => {
  it("웨이트 → 인터벌 → 유산소 순서를 보존한다", () => {
    const plan: OrderedWorkoutPlan = {
      blocks: [{ kind: "exercise", key: "bench" }, interval, { kind: "exercise", key: "run" }],
      intervalMinutes: 8,
    };
    expect(validateOrderedWorkoutPlan(plan)).toEqual([]);
    expect(orderedExerciseKeys(plan)).toEqual(["bench", "a", "b", "c", "d", "run"]);
    expect(intervalBlockStart(plan)).toBe(1);
  });

  it("기존 인터벌 → 웨이트 구조는 0번 위치를 사용한다", () => {
    expect(intervalBlockStart({ blocks: [interval, { kind: "exercise", key: "bench" }], intervalMinutes: 8 })).toBe(0);
    expect(isOrderedIntervalExercise({ tabataMinutes: 8, sortOrder: 3 })).toBe(true);
    expect(isOrderedIntervalExercise({ tabataMinutes: 8, sortOrder: 4 })).toBe(false);
  });

  it("자유 순서의 인터벌 네 종목만 식별한다", () => {
    expect(isOrderedIntervalExercise({ tabataMinutes: 8, sortOrder: 0, intervalStartOrder: 1 })).toBe(false);
    expect(isOrderedIntervalExercise({ tabataMinutes: 8, sortOrder: 1, intervalStartOrder: 1 })).toBe(true);
    expect(isOrderedIntervalExercise({ tabataMinutes: 8, sortOrder: 4, intervalStartOrder: 1 })).toBe(true);
    expect(isOrderedIntervalExercise({ tabataMinutes: 8, sortOrder: 5, intervalStartOrder: 1 })).toBe(false);
  });

  it("인터벌 완료가 웨이트와 유산소의 완료 여부를 건드리지 않는다", () => {
    const exercises = ["bench", "a", "b", "c", "d", "run"].map((key) => ({ key, sets: [{ done: false }] }));
    const result = completeOrderedInterval(exercises, interval.keys);
    expect(result.map((ex) => ex.sets[0].done)).toEqual([false, true, true, true, true, false]);
    expect(exercises[1].sets[0].done).toBe(false);
  });

  it("인터벌 두 개 또는 중복 키를 거부한다", () => {
    expect(validateOrderedWorkoutPlan({ blocks: [interval, interval], intervalMinutes: 8 }).length).toBeGreaterThan(0);
    expect(validateOrderedWorkoutPlan({ blocks: [interval, { kind: "exercise", key: "a" }], intervalMinutes: 8 }).length).toBeGreaterThan(0);
  });

  it("인터벌 없는 일반 운동도 허용한다", () => {
    const plan: OrderedWorkoutPlan = { blocks: [{ kind: "exercise", key: "run" }], intervalMinutes: null };
    expect(orderedExerciseKeys(plan)).toEqual(["run"]);
    expect(intervalBlockStart(plan)).toBeNull();
  });
});
