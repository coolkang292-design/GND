import { describe, expect, it } from "vitest";
import { nextUpSet, type NextUpExercise } from "./next-up";

/**
 * ② 휴식 화면에서 다음 진행 항목 미리 보기 (2026-08-04).
 *
 * 요구: "휴식 타이머 화면에서 다음 운동 또는 다음 진행 항목을 미리 확인할 수
 * 있어야 함". 기준은 **아직 완료하지 않은 첫 세트**다 — 방금 하나를 완료해
 * 휴식이 시작된 참이므로, 남은 것 중 처음이 곧 다음이다.
 */
const set = (done: boolean, partial: Partial<NextUpExercise["sets"][number]> = {}) => ({
  weightKg: 0,
  reps: 0,
  distanceKm: 0,
  durationMin: 0,
  done,
  ...partial,
});

const bench: NextUpExercise = {
  name: "벤치 프레스",
  exerciseType: "weight",
  measure: null,
  sets: [
    set(true, { weightKg: 60, reps: 10 }),
    set(false, { weightKg: 60, reps: 8 }),
    set(false, { weightKg: 60, reps: 6 }),
  ],
};

describe("nextUpSet", () => {
  it("같은 종목에 남은 세트가 있으면 그 세트를 가리킨다", () => {
    expect(nextUpSet([bench])).toEqual({
      exerciseName: "벤치 프레스",
      setNumber: 2,
      amount: "60kg 8회",
    });
  });

  it("현재 종목을 다 끝냈으면 다음 종목의 첫 세트로 넘어간다", () => {
    const done: NextUpExercise = {
      ...bench,
      sets: bench.sets.map((s) => ({ ...s, done: true })),
    };
    const squat: NextUpExercise = {
      name: "스쿼트",
      exerciseType: "weight",
      measure: null,
      sets: [set(false, { weightKg: 80, reps: 5 })],
    };

    expect(nextUpSet([done, squat])).toEqual({
      exerciseName: "스쿼트",
      setNumber: 1,
      amount: "80kg 5회",
    });
  });

  it("모든 세트를 끝냈으면 null — 화면이 '다 했어요'를 말할 수 있어야 한다", () => {
    const done: NextUpExercise = {
      ...bench,
      sets: bench.sets.map((s) => ({ ...s, done: true })),
    };

    expect(nextUpSet([done])).toBeNull();
  });

  it("종목이 없으면 null", () => {
    expect(nextUpSet([])).toBeNull();
  });

  it("중간 종목을 건너뛰고 완료했어도 순서상 앞의 미완료가 먼저다", () => {
    // 사용자가 2번 종목을 먼저 했더라도 목록 순서가 진행 순서다.
    const first: NextUpExercise = {
      name: "첫 종목",
      exerciseType: "weight",
      measure: null,
      sets: [set(false, { weightKg: 20, reps: 12 })],
    };
    const second: NextUpExercise = {
      name: "둘째 종목",
      exerciseType: "weight",
      measure: null,
      sets: [set(true, { weightKg: 30, reps: 10 })],
    };

    expect(nextUpSet([first, second])?.exerciseName).toBe("첫 종목");
  });

  it("유산소·맨몸도 각자 표기 규칙으로 수량을 만든다", () => {
    const cardio: NextUpExercise = {
      name: "러닝",
      exerciseType: "cardio",
      measure: null,
      sets: [set(false, { distanceKm: 3, durationMin: 25 })],
    };
    const plank: NextUpExercise = {
      name: "플랭크",
      exerciseType: "bodyweight",
      measure: "time",
      sets: [set(false, { durationMin: 2 })],
    };

    expect(nextUpSet([cardio])?.amount).toBe("3km 25분");
    expect(nextUpSet([plank])?.amount).toBe("2분");
  });

  it("세트가 없는 종목은 건너뛴다", () => {
    const empty: NextUpExercise = {
      name: "빈 종목",
      exerciseType: "weight",
      measure: null,
      sets: [],
    };

    expect(nextUpSet([empty, bench])?.exerciseName).toBe("벤치 프레스");
  });
});
