import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  isPlanDateAllowed,
  parsePlanExercises,
  toDraftExercises,
  toPlanExercises,
  type PlanExercise,
} from "./workout-plan";

const plan: PlanExercise[] = [
  {
    name: "벤치프레스",
    bodyPart: "가슴",
    exerciseType: "weight",
    measure: null,
    isCustom: false,
    sets: [
      { weightKg: 60, reps: 10, distanceKm: 0, durationMin: 0 },
      { weightKg: 65, reps: 8, distanceKm: 0, durationMin: 0 },
    ],
  },
];

describe("운동 예정표 날짜", () => {
  it("오늘과 미래만 저장할 수 있다", () => {
    expect(isPlanDateAllowed("2026-07-18", "2026-07-18")).toBe(true);
    expect(isPlanDateAllowed("2026-07-19", "2026-07-18")).toBe(true);
    expect(isPlanDateAllowed("2026-07-17", "2026-07-18")).toBe(false);
  });

  it("실제 존재하지 않는 날짜와 형식을 거부한다", () => {
    expect(isPlanDateAllowed("2026-02-29", "2026-01-01")).toBe(false);
    expect(isPlanDateAllowed("2026-7-18", "2026-01-01")).toBe(false);
  });

  it("날짜 키에 일수를 더할 때 월·연 경계를 처리한다", () => {
    expect(addDaysToDateKey("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("운동 예정표 종목·세트 변환", () => {
  it("로컬 key와 완료 상태를 제외하고 저장 구조로 만든다", () => {
    expect(
      toPlanExercises([
        {
          key: "exercise-key",
          ...plan[0],
          sets: plan[0].sets.map((set, index) => ({
            key: `set-${index}`,
            ...set,
            done: true,
          })),
        },
      ]),
    ).toEqual(plan);
  });

  it("불러올 때 새 key를 만들고 모든 세트를 미완료로 초기화한다", () => {
    let index = 0;
    const draft = toDraftExercises(plan, () => `key-${index++}`);
    expect(draft[0].key).toBe("key-0");
    expect(draft[0].sets.map((set) => set.key)).toEqual(["key-1", "key-2"]);
    expect(draft[0].sets.every((set) => set.done === false)).toBe(true);
  });

  it("DB의 올바른 구조는 읽고 알 수 없는 필드는 버린다", () => {
    expect(parsePlanExercises([{ ...plan[0], ignored: "x" }])).toEqual(plan);
  });

  it("빈 종목, 잘못된 유형, 세트 없는 종목은 거부한다", () => {
    expect(parsePlanExercises([])).toEqual([]);
    expect(parsePlanExercises([{ ...plan[0], name: "" }])).toEqual([]);
    expect(parsePlanExercises([{ ...plan[0], exerciseType: "invalid" }])).toEqual(
      [],
    );
    expect(parsePlanExercises([{ ...plan[0], sets: [] }])).toEqual([]);
  });
});
