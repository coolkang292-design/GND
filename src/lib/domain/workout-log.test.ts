import { describe, expect, it } from "vitest";
import { formatWorkoutLog, type LogExercise } from "./workout-log";

const set = (
  partial: Partial<LogExercise["sets"][number]> = {},
): LogExercise["sets"][number] => ({
  weightKg: 0,
  reps: 0,
  distanceKm: 0,
  durationMin: 0,
  done: true,
  ...partial,
});

const weight = (
  name: string,
  sets: [number, number, boolean?][],
): LogExercise => ({
  name,
  exerciseType: "weight",
  measure: null,
  sets: sets.map(([weightKg, reps, done]) =>
    set({ weightKg, reps, done: done ?? true }),
  ),
});

describe("formatWorkoutLog — 사용자 예시 형식 (AI 코치 공유용)", () => {
  it("웨이트 종목: 'n세트: {kg}kg {회}회' 형식", () => {
    expect(
      formatWorkoutLog("2026-07-10", [
        weight("인클라인 벤치프레스 머신", [
          [35, 12],
          [35, 9],
        ]),
      ]),
    ).toBe(
      "2026-07-10 운동 일지\n\n인클라인 벤치프레스 머신\n1세트: 35kg 12회\n2세트: 35kg 9회",
    );
  });

  it("여러 종목은 빈 줄로 구분한다", () => {
    const text = formatWorkoutLog("2026-07-10", [
      weight("해머 벤치프레스", [[30, 7]]),
      weight("체스트 프레스 머신", [[40, 7]]),
    ]);
    expect(text).toBe(
      "2026-07-10 운동 일지\n\n해머 벤치프레스\n1세트: 30kg 7회\n\n체스트 프레스 머신\n1세트: 40kg 7회",
    );
  });

  it("미완료 세트는 제외하고 1부터 재번호를 붙인다", () => {
    const text = formatWorkoutLog("2026-07-10", [
      weight("스쿼트", [
        [60, 10, false],
        [60, 8, true],
        [60, 6, true],
      ]),
    ]);
    expect(text).toBe("2026-07-10 운동 일지\n\n스쿼트\n1세트: 60kg 8회\n2세트: 60kg 6회");
  });

  it("완료 세트가 없는 종목은 생략한다", () => {
    const text = formatWorkoutLog("2026-07-10", [
      weight("스쿼트", [[60, 10, false]]),
      weight("데드리프트", [[80, 5, true]]),
    ]);
    expect(text).toBe("2026-07-10 운동 일지\n\n데드리프트\n1세트: 80kg 5회");
  });

  it("종목이 하나도 없으면 제목만 반환한다", () => {
    expect(formatWorkoutLog("2026-07-10", [])).toBe("2026-07-10 운동 일지");
  });

  it("맨몸(reps): 횟수만 표시한다", () => {
    const text = formatWorkoutLog("2026-07-10", [
      {
        name: "푸시업",
        exerciseType: "bodyweight",
        measure: "reps",
        sets: [set({ reps: 20 })],
      },
    ]);
    expect(text).toBe("2026-07-10 운동 일지\n\n푸시업\n1세트: 20회");
  });

  it("맨몸(time): 분으로 표시한다", () => {
    const text = formatWorkoutLog("2026-07-10", [
      {
        name: "플랭크",
        exerciseType: "bodyweight",
        measure: "time",
        sets: [set({ durationMin: 3 })],
      },
    ]);
    expect(text).toBe("2026-07-10 운동 일지\n\n플랭크\n1세트: 3분");
  });

  it("유산소: 거리와 시간을 함께, 0인 항목은 생략한다", () => {
    const run: LogExercise = {
      name: "러닝",
      exerciseType: "cardio",
      measure: null,
      sets: [set({ distanceKm: 5, durationMin: 30 })],
    };
    expect(formatWorkoutLog("2026-07-10", [run])).toBe(
      "2026-07-10 운동 일지\n\n러닝\n1세트: 5km 30분",
    );

    const timeOnly: LogExercise = {
      ...run,
      sets: [set({ distanceKm: 0, durationMin: 20 })],
    };
    expect(formatWorkoutLog("2026-07-10", [timeOnly])).toBe(
      "2026-07-10 운동 일지\n\n러닝\n1세트: 20분",
    );
  });

  it("유산소 거리·시간이 모두 0이면 '0분'으로 표시한다", () => {
    const text = formatWorkoutLog("2026-07-10", [
      {
        name: "러닝",
        exerciseType: "cardio",
        measure: null,
        sets: [set()],
      },
    ]);
    expect(text).toBe("2026-07-10 운동 일지\n\n러닝\n1세트: 0분");
  });

  it("소수 중량·거리는 그대로 표시한다 (2.5kg, 1.5km)", () => {
    const text = formatWorkoutLog("2026-07-10", [
      weight("덤벨 컬", [[2.5, 15]]),
      {
        name: "러닝",
        exerciseType: "cardio",
        measure: null,
        sets: [set({ distanceKm: 1.5, durationMin: 10 })],
      },
    ]);
    expect(text).toBe(
      "2026-07-10 운동 일지\n\n덤벨 컬\n1세트: 2.5kg 15회\n\n러닝\n1세트: 1.5km 10분",
    );
  });
});
