import { describe, expect, it } from "vitest";
import {
  datesNeedingMerge,
  isGeneralPlan,
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
