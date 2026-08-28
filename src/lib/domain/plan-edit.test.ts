import { describe, expect, it } from "vitest";
import type { PlanExercise, PlanSet } from "./workout-plan";
import {
  MAX_PLAN_SETS,
  appendPlanRows,
  applySetupPlanToRow,
  planEditRows,
  planExercisesFromRows,
  removePlanRow,
  setupEntriesFromRows,
} from "./plan-edit";

let counter = 0;
const makeKey = () => `k${++counter}`;

function set(patch: Partial<PlanSet> = {}): PlanSet {
  return { weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0, ...patch };
}

/** 세트마다 무게가 다른 종목 — 지난 기록을 복사한 예정표가 이 모양이다 */
function ramped(): PlanExercise {
  return {
    name: "벤치프레스",
    bodyPart: "가슴",
    exerciseType: "weight",
    measure: null,
    isCustom: false,
    sets: [
      set({ weightKg: 60, reps: 10 }),
      set({ weightKg: 65, reps: 10 }),
      set({ weightKg: 70, reps: 8 }),
    ],
  };
}

function plank(): PlanExercise {
  return {
    name: "플랭크",
    bodyPart: "코어",
    exerciseType: "bodyweight",
    measure: "time",
    isCustom: false,
    sets: [set({ durationMin: 1 }), set({ durationMin: 1 })],
  };
}

function running(): PlanExercise {
  return {
    name: "러닝",
    bodyPart: "유산소",
    exerciseType: "cardio",
    measure: null,
    isCustom: false,
    sets: [set()],
  };
}

function rowOf(exercise: PlanExercise) {
  return planEditRows([exercise], makeKey)[0];
}

describe("planEditRows — 편집용 줄 만들기", () => {
  it("종목 순서를 유지하고 줄마다 고유 키를 준다", () => {
    const rows = planEditRows([ramped(), plank()], makeKey);
    expect(rows.map((row) => row.exercise.name)).toEqual([
      "벤치프레스",
      "플랭크",
    ]);
    expect(rows[0].key).not.toBe(rows[1].key);
  });

  it("이름이 같은 종목이 둘이어도 키가 갈린다", () => {
    const rows = planEditRows([ramped(), ramped()], makeKey);
    expect(rows[0].key).not.toBe(rows[1].key);
  });
});

describe("setupEntriesFromRows — 조절 화면이 읽는 모양", () => {
  it("첫 세트를 대표값으로 요약한다", () => {
    const entries = setupEntriesFromRows(planEditRows([ramped()], makeKey));
    expect(entries[0].plan).toEqual({ sets: 3, amount: 10, weightKg: 60 });
    expect(entries[0].item.name).toBe("벤치프레스");
    expect(entries[0].item.exercise_type).toBe("weight");
  });

  it("시간형은 분을 대표값으로 읽는다", () => {
    const entries = setupEntriesFromRows(planEditRows([plank()], makeKey));
    expect(entries[0].plan.amount).toBe(1);
  });

  it("줄의 키를 그대로 item.id로 쓴다 — 카탈로그를 조회하지 않는다", () => {
    const rows = planEditRows([ramped()], makeKey);
    expect(setupEntriesFromRows(rows)[0].item.id).toBe(rows[0].key);
  });
});

describe("applySetupPlanToRow — 바꾼 항목만 반영한다", () => {
  it("아무것도 바꾸지 않으면 세트별 무게가 그대로 남는다", () => {
    const row = rowOf(ramped());
    const same = { sets: 3, amount: 10, weightKg: 60 };
    const next = applySetupPlanToRow(row, same);
    expect(next.exercise.sets.map((s) => s.weightKg)).toEqual([60, 65, 70]);
    expect(next.exercise.sets.map((s) => s.reps)).toEqual([10, 10, 8]);
  });

  it("세트를 늘리면 마지막 세트를 복사해 뒤에 붙인다", () => {
    const next = applySetupPlanToRow(rowOf(ramped()), {
      sets: 4,
      amount: 10,
      weightKg: 60,
    });
    expect(next.exercise.sets.map((s) => s.weightKg)).toEqual([60, 65, 70, 70]);
    expect(next.exercise.sets.map((s) => s.reps)).toEqual([10, 10, 8, 8]);
  });

  it("세트를 줄이면 뒤에서 자른다", () => {
    const next = applySetupPlanToRow(rowOf(ramped()), {
      sets: 2,
      amount: 10,
      weightKg: 60,
    });
    expect(next.exercise.sets.map((s) => s.weightKg)).toEqual([60, 65]);
  });

  it("목표 횟수를 바꾸면 전 세트에 적용하고 무게는 건드리지 않는다", () => {
    const next = applySetupPlanToRow(rowOf(ramped()), {
      sets: 3,
      amount: 12,
      weightKg: 60,
    });
    expect(next.exercise.sets.map((s) => s.reps)).toEqual([12, 12, 12]);
    expect(next.exercise.sets.map((s) => s.weightKg)).toEqual([60, 65, 70]);
  });

  it("무게를 바꾸면 전 세트에 적용하고 횟수는 건드리지 않는다", () => {
    const next = applySetupPlanToRow(rowOf(ramped()), {
      sets: 3,
      amount: 10,
      weightKg: 80,
    });
    expect(next.exercise.sets.map((s) => s.weightKg)).toEqual([80, 80, 80]);
    expect(next.exercise.sets.map((s) => s.reps)).toEqual([10, 10, 8]);
  });

  it("무게를 0으로 되돌리면 전 세트가 '운동 중 입력'이 된다", () => {
    const next = applySetupPlanToRow(rowOf(ramped()), {
      sets: 3,
      amount: 10,
      weightKg: 0,
    });
    expect(next.exercise.sets.map((s) => s.weightKg)).toEqual([0, 0, 0]);
  });

  it("시간형은 분에 적용한다", () => {
    const next = applySetupPlanToRow(rowOf(plank()), {
      sets: 2,
      amount: 3,
      weightKg: 0,
    });
    expect(next.exercise.sets.map((s) => s.durationMin)).toEqual([3, 3]);
    expect(next.exercise.sets.every((s) => s.reps === 0)).toBe(true);
  });

  it("유산소는 세트 수만 바뀌고 거리·시간은 0으로 남는다", () => {
    const next = applySetupPlanToRow(rowOf(running()), {
      sets: 3,
      amount: 0,
      weightKg: 0,
    });
    expect(next.exercise.sets).toHaveLength(3);
    expect(next.exercise.sets.every((s) => s.distanceKm === 0)).toBe(true);
  });

  it("세트는 1개 밑으로 내려가지 않는다", () => {
    const next = applySetupPlanToRow(rowOf(ramped()), {
      sets: 0,
      amount: 10,
      weightKg: 60,
    });
    expect(next.exercise.sets).toHaveLength(1);
  });

  it(`세트는 ${MAX_PLAN_SETS}개를 넘지 않는다 — DB 파서의 상한과 같다`, () => {
    const next = applySetupPlanToRow(rowOf(ramped()), {
      sets: 99,
      amount: 10,
      weightKg: 60,
    });
    expect(next.exercise.sets).toHaveLength(MAX_PLAN_SETS);
  });

  it("키와 종목 메타는 유지한다", () => {
    const row = rowOf(ramped());
    const next = applySetupPlanToRow(row, { sets: 5, amount: 10, weightKg: 60 });
    expect(next.key).toBe(row.key);
    expect(next.exercise.bodyPart).toBe("가슴");
    expect(next.exercise.isCustom).toBe(false);
  });
});

describe("appendPlanRows — 종목 추가", () => {
  it("뒤에 붙인다", () => {
    const rows = planEditRows([ramped()], makeKey);
    const result = appendPlanRows(rows, [plank()], makeKey);
    expect(result.rows.map((r) => r.exercise.name)).toEqual([
      "벤치프레스",
      "플랭크",
    ]);
    expect(result.addedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
  });

  it("이미 있는 이름은 건너뛴다 — 기록 화면의 불러오기와 같은 규칙", () => {
    const rows = planEditRows([ramped()], makeKey);
    const result = appendPlanRows(rows, [ramped(), plank()], makeKey);
    expect(result.rows).toHaveLength(2);
    expect(result.addedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it("기존 줄의 세트를 덮어쓰지 않는다", () => {
    const rows = planEditRows([ramped()], makeKey);
    const result = appendPlanRows(rows, [ramped()], makeKey);
    expect(result.rows[0].exercise.sets.map((s) => s.weightKg)).toEqual([
      60, 65, 70,
    ]);
  });
});

describe("removePlanRow · planExercisesFromRows", () => {
  it("키로 한 줄만 지운다", () => {
    const rows = planEditRows([ramped(), plank()], makeKey);
    const left = removePlanRow(rows, rows[0].key);
    expect(left.map((r) => r.exercise.name)).toEqual(["플랭크"]);
  });

  it("저장용 배열은 순서를 유지한다", () => {
    const rows = planEditRows([ramped(), plank()], makeKey);
    expect(planExercisesFromRows(rows).map((e) => e.name)).toEqual([
      "벤치프레스",
      "플랭크",
    ]);
  });

  it("저장용 배열은 DB 파서를 통과한다", () => {
    const rows = planEditRows([ramped(), plank(), running()], makeKey);
    expect(planExercisesFromRows(rows)).toHaveLength(3);
  });
});
