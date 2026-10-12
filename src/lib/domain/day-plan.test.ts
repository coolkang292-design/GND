import { describe, expect, it } from "vitest";
import {
  datesNeedingMerge,
  isGeneralPlan,
  MAX_PLAN_EXERCISES,
  mergePlanExercises,
  pickDayGeneralPlan,
  planDayMerge,
  remainingAfterWorkout,
} from "./day-plan";
import type { PlanExercise } from "./workout-plan";

function ex(name: string, reps = 10): PlanExercise {
  return {
    name,
    bodyPart: "하체",
    exerciseType: "bodyweight",
    measure: "reps",
    isCustom: false,
    sets: [{ weightKg: 0, reps, distanceKm: 0, durationMin: 0 }],
  };
}

function plan(
  id: string,
  over: Partial<{
    planDate: string;
    tabataMinutes: number | null;
    programEnrollmentId: string | null;
    exercises: PlanExercise[];
  }> = {},
) {
  return {
    id,
    planDate: "2026-10-13",
    tabataMinutes: null,
    programEnrollmentId: null,
    exercises: [ex(`${id}-종목`)],
    ...over,
  };
}

describe("isGeneralPlan", () => {
  it("인터벌·프로그램 회차가 아니면 일반 계획이다", () => {
    expect(isGeneralPlan(plan("a"))).toBe(true);
    expect(isGeneralPlan(plan("b", { tabataMinutes: 8 }))).toBe(false);
    expect(isGeneralPlan(plan("c", { programEnrollmentId: "e1" }))).toBe(false);
  });

  it("두 필드가 아예 없는 행(0059 이전·테스트 고정값)도 일반 계획이다", () => {
    expect(isGeneralPlan({})).toBe(true);
  });
});

describe("pickDayGeneralPlan", () => {
  it("인터벌·프로그램을 건너뛰고 첫 일반 계획을 고른다", () => {
    const general = plan("g");
    expect(
      pickDayGeneralPlan([
        plan("i", { tabataMinutes: 4 }),
        plan("p", { programEnrollmentId: "e1" }),
        general,
      ]),
    ).toBe(general);
  });

  it("일반 계획이 없으면 null", () => {
    expect(pickDayGeneralPlan([plan("i", { tabataMinutes: 4 })])).toBeNull();
  });
});

describe("mergePlanExercises", () => {
  it("이름이 겹치지 않는 종목만 뒤에 붙인다 (대소문자·앞뒤 공백 무시)", () => {
    const result = mergePlanExercises(
      [ex("점프 스쿼트", 25)],
      [ex(" 점프 스쿼트 ", 5), ex("풀업")],
    );
    expect(result.exercises.map((e) => e.name)).toEqual(["점프 스쿼트", "풀업"]);
    expect(result.exercises[0].sets[0].reps).toBe(25);
    expect(result.skippedCount).toBe(1);
    expect(result.overflowCount).toBe(0);
  });

  it("이름이 빈 종목은 건너뛴다", () => {
    const result = mergePlanExercises([ex("풀업")], [ex("   "), ex("")]);
    expect(result.exercises.map((e) => e.name)).toEqual(["풀업"]);
    expect(result.skippedCount).toBe(2);
  });

  it("더할 목록 안의 중복은 한 번만 넣는다", () => {
    const result = mergePlanExercises([], [ex("풀업", 4), ex("풀업", 9), ex("푸시업")]);
    expect(result.exercises.map((e) => e.name)).toEqual(["풀업", "푸시업"]);
    expect(result.exercises[0].sets[0].reps).toBe(4);
    expect(result.skippedCount).toBe(1);
  });

  it("base 안에 이미 있는 중복은 건드리지 않는다", () => {
    const base = [ex("풀업", 4), ex("풀업", 9)];
    const result = mergePlanExercises(base, [ex("푸시업")]);
    expect(result.exercises.map((e) => e.name)).toEqual(["풀업", "풀업", "푸시업"]);
  });

  it("50개를 넘기는 종목은 넣지 않고 overflowCount로 센다", () => {
    expect(MAX_PLAN_EXERCISES).toBe(50);
    const base = Array.from({ length: 49 }, (_, i) => ex(`기존-${i}`));
    const result = mergePlanExercises(base, [ex("a"), ex("b"), ex("c")]);
    expect(result.exercises).toHaveLength(50);
    expect(result.exercises[49].name).toBe("a");
    expect(result.skippedCount).toBe(0);
    expect(result.overflowCount).toBe(2);
  });

  it("이미 50개인 계획에는 새 종목이 하나도 들어가지 않는다", () => {
    const base = Array.from({ length: 50 }, (_, i) => ex(`기존-${i}`));
    const result = mergePlanExercises(base, [ex("a"), ex("기존-3")]);
    expect(result.exercises).toHaveLength(50);
    expect(result.skippedCount).toBe(1);
    expect(result.overflowCount).toBe(1);
  });
});

describe("planDayMerge", () => {
  it("일반 계획이 하나 이하면 할 일이 없다", () => {
    expect(planDayMerge([plan("a"), plan("i", { tabataMinutes: 4 })])).toBeNull();
  });

  it("첫 일반 계획에 나머지를 합치고 나머지는 지운다 — 신고 화면 재현", () => {
    const jump = plan("a", { exercises: [ex("점프 스쿼트", 25)] });
    const pull = plan("b", { exercises: [ex("풀업", 4), ex("밴드 레터럴 레이즈", 12)] });
    const program = plan("p", { programEnrollmentId: "e1" });
    expect(planDayMerge([jump, program, pull])).toEqual({
      keepId: "a",
      exercises: [ex("점프 스쿼트", 25), ex("풀업", 4), ex("밴드 레터럴 레이즈", 12)],
      deleteIds: ["b"],
    });
  });

  it("셋 이상이면 순서대로 첫 계획에 합치고 겹치는 이름은 한 번만 남긴다", () => {
    const a = plan("a", { exercises: [ex("점프 스쿼트", 25), ex("풀업", 4)] });
    const b = plan("b", { exercises: [ex("풀업", 9), ex("푸시업")] });
    const c = plan("c", { exercises: [ex("푸시업", 3), ex("점프 스쿼트", 1), ex("런지")] });
    expect(planDayMerge([a, b, c])).toEqual({
      keepId: "a",
      exercises: [ex("점프 스쿼트", 25), ex("풀업", 4), ex("푸시업"), ex("런지")],
      deleteIds: ["b", "c"],
    });
  });

  it("합치다 50개를 넘기는 계획부터는 합치지도 지우지도 않는다 — 종목 손실 방지", () => {
    const a = plan("a", { exercises: Array.from({ length: 30 }, (_, i) => ex(`a-${i}`)) });
    const b = plan("b", { exercises: Array.from({ length: 15 }, (_, i) => ex(`b-${i}`)) });
    const c = plan("c", { exercises: Array.from({ length: 10 }, (_, i) => ex(`c-${i}`)) });
    const d = plan("d", { exercises: [ex("d-0")] });
    const merge = planDayMerge([a, b, c, d]);
    expect(merge?.keepId).toBe("a");
    expect(merge?.exercises).toHaveLength(45);
    // c가 못 들어가면 그 뒤의 d도 건드리지 않는다 — 순서가 뒤집히면 안 된다
    expect(merge?.deleteIds).toEqual(["b"]);
  });

  it("첫 번째 나머지 계획부터 넘치면 null — 아무것도 합치지 않는다", () => {
    const a = plan("a", { exercises: Array.from({ length: 40 }, (_, i) => ex(`a-${i}`)) });
    const b = plan("b", { exercises: Array.from({ length: 11 }, (_, i) => ex(`b-${i}`)) });
    expect(planDayMerge([a, b])).toBeNull();
  });
});

describe("datesNeedingMerge", () => {
  it("오늘 이후 날짜 중 일반 계획이 둘 이상인 날만 고른다", () => {
    expect(
      datesNeedingMerge(
        [
          plan("old1", { planDate: "2026-10-12" }),
          plan("old2", { planDate: "2026-10-12" }),
          plan("t1"),
          plan("t2"),
          plan("f1", { planDate: "2026-10-20" }),
          plan("fi", { planDate: "2026-10-20", tabataMinutes: 8 }),
        ],
        "2026-10-13",
      ),
    ).toEqual(["2026-10-13"]);
  });
});

describe("remainingAfterWorkout", () => {
  const planned = [ex("점프 스쿼트"), ex("풀업"), ex("밴드 레터럴 레이즈")];

  it("세트를 하나라도 끝낸 종목은 빼고 나머지를 남긴다", () => {
    expect(
      remainingAfterWorkout(planned, [
        { name: "점프 스쿼트", sets: [{ done: true }, { done: false }] },
        { name: "풀업", sets: [{ done: false }] },
      ]).map((e) => e.name),
    ).toEqual(["풀업", "밴드 레터럴 레이즈"]);
  });

  it("다 했으면 빈 배열", () => {
    expect(
      remainingAfterWorkout(
        planned,
        planned.map((e) => ({ name: e.name, sets: [{ done: true }] })),
      ),
    ).toEqual([]);
  });
});
