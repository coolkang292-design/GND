import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  isPlanDateAllowed,
  newPlanExercises,
  parsePlanExercises,
  toDraftExercises,
  toPlanExercises,
  type ExercisePrescription,
  type PlanExercise,
} from "./workout-plan";
import type { CatalogExercise } from "@/lib/types";

const catalogItem: CatalogExercise = {
  id: "cat-1",
  name: "랫풀다운",
  body_part: "등",
  exercise_type: "weight",
  measure: null,
  is_custom: false,
  created_by: null,
  created_at: "2026-07-01T00:00:00Z",
};

const longRestPrescription: ExercisePrescription = {
  repsMin: 8,
  repsMax: 12,
  targetRir: 2,
  restSeconds: 180,
  loadStepKg: 2.5,
};

describe("ExercisePrescription", () => {
  it("계획 저장 계약의 180초 휴식을 표현한다", () => {
    expect(longRestPrescription.restSeconds).toBe(180);
  });
});

describe("newPlanExercises", () => {
  it("카탈로그 선택을 0값 세트 1개짜리 계획 운동으로 변환한다", () => {
    expect(newPlanExercises([catalogItem])).toEqual([
      {
        name: "랫풀다운",
        bodyPart: "등",
        exerciseType: "weight",
        measure: null,
        isCustom: false,
        sets: [{ weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0 }],
      },
    ]);
  });

  it("맨몸 시간형의 measure와 커스텀 여부를 보존한다", () => {
    const result = newPlanExercises([
      {
        ...catalogItem,
        name: "플랭크",
        body_part: "코어",
        exercise_type: "bodyweight",
        measure: "time",
        is_custom: true,
      },
    ]);
    expect(result[0]).toMatchObject({
      name: "플랭크",
      bodyPart: "코어",
      exerciseType: "bodyweight",
      measure: "time",
      isCustom: true,
    });
  });

  it("빈 선택은 빈 배열", () => {
    expect(newPlanExercises([])).toEqual([]);
  });
});

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

  it("프로그램 처방을 파싱하고 draft와 저장 구조에 그대로 보존한다", () => {
    const prescription: ExercisePrescription = {
      repsMin: 8,
      repsMax: 12,
      targetRir: 2,
      restSeconds: 120,
      loadStepKg: 2.5,
    };
    const parsed = parsePlanExercises([
      { ...plan[0], prescription: { ...prescription, ignored: "x" } },
    ]);

    expect(parsed[0].prescription).toEqual(prescription);
    expect(toDraftExercises(parsed, () => "key")[0].prescription).toEqual(
      prescription,
    );
    expect(
      toPlanExercises([
        {
          key: "exercise-key",
          ...parsed[0],
          sets: parsed[0].sets.map((set, index) => ({
            key: `set-${index}`,
            ...set,
            done: false,
          })),
        },
      ])[0].prescription,
    ).toEqual(prescription);
  });

  it("처방이 없는 기존 계획은 그대로 유효하다", () => {
    expect(parsePlanExercises(plan)).toEqual(plan);
  });

  it.each([
    ["역전된 반복 범위", { repsMin: 12, repsMax: 8 }],
    ["최소 반복 미만", { repsMin: 0 }],
    ["최대 반복 초과", { repsMax: 101 }],
    ["비정수 최소 반복", { repsMin: 8.5 }],
    ["비정수 최대 반복", { repsMax: 12.5 }],
    ["60초 미만 휴식", { restSeconds: 59 }],
    ["300초 초과 휴식", { restSeconds: 301 }],
    ["비정수 휴식", { restSeconds: 90.5 }],
    ["잘못된 RIR", { targetRir: 4 }],
    ["잘못된 증량 단위", { loadStepKg: 2 }],
  ])("처방의 %s를 거부한다", (_label, override) => {
    expect(
      parsePlanExercises([
        {
          ...plan[0],
          prescription: { ...longRestPrescription, ...override },
        },
      ]),
    ).toEqual([]);
  });

  it("잘못된 처방이 하나라도 있으면 혼합 배열 전체를 거부한다", () => {
    expect(
      parsePlanExercises([
        plan[0],
        {
          ...plan[0],
          name: "인클라인 벤치프레스",
          prescription: {
            ...longRestPrescription,
            restSeconds: 301,
          },
        },
      ]),
    ).toEqual([]);
  });

  it.each([
    {
      repsMin: 1,
      repsMax: 1,
      targetRir: 1 as const,
      restSeconds: 60,
      loadStepKg: 1 as const,
    },
    {
      repsMin: 100,
      repsMax: 100,
      targetRir: 3 as const,
      restSeconds: 300,
      loadStepKg: 5 as const,
    },
  ])("반복과 휴식 경계값을 수용한다", (prescription) => {
    expect(parsePlanExercises([{ ...plan[0], prescription }])[0].prescription).toEqual(
      prescription,
    );
  });

  it("파싱과 draft·저장 변환은 입력을 변경하지 않는다", () => {
    const source = [{ ...plan[0], prescription: longRestPrescription }];
    const sourceBefore = structuredClone(source);
    const parsed = parsePlanExercises(source);
    const parsedBefore = structuredClone(parsed);
    const local = [
      {
        key: "exercise-key",
        ...parsed[0],
        sets: parsed[0].sets.map((set, index) => ({
          key: `set-${index}`,
          ...set,
          done: false,
        })),
      },
    ];
    const localBefore = structuredClone(local);

    toDraftExercises(parsed, () => "key");
    toPlanExercises(local);

    expect(source).toEqual(sourceBefore);
    expect(parsed).toEqual(parsedBefore);
    expect(local).toEqual(localBefore);
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
