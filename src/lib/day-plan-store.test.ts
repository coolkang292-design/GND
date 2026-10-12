import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanExercise } from "@/lib/domain/workout-plan";
import type { WorkoutPlan } from "@/lib/workout-plan";

const mocks = vi.hoisted(() => ({
  getWorkoutPlansByDate: vi.fn(),
  getWorkoutPlanById: vi.fn(),
  createWorkoutPlan: vi.fn(),
  updateWorkoutPlan: vi.fn(),
  deleteWorkoutPlan: vi.fn(),
}));
vi.mock("@/lib/workout-plan", () => mocks);

import {
  addToDayPlan,
  consolidateDayPlans,
  consolidateUpcomingPlans,
  settlePlanAfterWorkout,
} from "./day-plan-store";

function ex(name: string): PlanExercise {
  return {
    name,
    bodyPart: "하체",
    exerciseType: "bodyweight",
    measure: "reps",
    isCustom: false,
    sets: [{ weightKg: 0, reps: 10, distanceKm: 0, durationMin: 0 }],
  };
}

function plan(id: string, over: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id,
    userId: "u1",
    planDate: "2026-10-13",
    sourceSessionId: null,
    exercises: [ex(`${id}-종목`)],
    tabataMinutes: null,
    title: null,
    scheduledAt: null,
    programEnrollmentId: null,
    programWeek: null,
    programSession: null,
    programTemplateVersion: null,
    createdAt: "c",
    updatedAt: "u",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateWorkoutPlan.mockImplementation(async (input) =>
    plan(input.planId, { exercises: input.exercises, updatedAt: "u2" }),
  );
  mocks.createWorkoutPlan.mockImplementation(async (input) =>
    plan("new", { planDate: input.planDate, exercises: input.exercises }),
  );
  mocks.deleteWorkoutPlan.mockResolvedValue(undefined);
});

describe("consolidateDayPlans", () => {
  it("일반 계획이 둘이면 첫 것에 합치고, 고친 뒤에 나머지를 지운다", async () => {
    const jump = plan("a", { exercises: [ex("점프 스쿼트")] });
    const pull = plan("b", { exercises: [ex("풀업")] });
    const interval = plan("i", { tabataMinutes: 8 });
    mocks.getWorkoutPlansByDate.mockResolvedValue([jump, interval, pull]);

    const result = await consolidateDayPlans("u1", "2026-10-13");

    expect(mocks.updateWorkoutPlan).toHaveBeenCalledWith({
      planId: "a",
      sourceSessionId: null,
      exercises: [ex("점프 스쿼트"), ex("풀업")],
      tabataMinutes: null,
    });
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("b");
    // 고치기가 지우기보다 먼저다 — 지우기만 성공하고 고치기가 실패하면 종목이 사라진다
    expect(mocks.updateWorkoutPlan.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteWorkoutPlan.mock.invocationCallOrder[0],
    );
    expect(result.map((p) => p.id)).toEqual(["a", "i"]);
  });

  it("중복이 없으면 쓰지 않는다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([plan("a")]);
    await consolidateDayPlans("u1", "2026-10-13");
    expect(mocks.updateWorkoutPlan).not.toHaveBeenCalled();
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });
});

describe("addToDayPlan", () => {
  it("그날 일반 계획이 없으면 만든다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([plan("i", { tabataMinutes: 4 })]);
    const result = await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-13",
      exercises: [ex("풀업")],
    });
    expect(result.created).toBe(true);
    expect(mocks.createWorkoutPlan).toHaveBeenCalledWith({
      userId: "u1",
      planDate: "2026-10-13",
      sourceSessionId: null,
      exercises: [ex("풀업")],
    });
    expect(result.dayPlans.map((p) => p.id)).toEqual(["i", "new"]);
  });

  it("있으면 새로 만들지 않고 그 계획에 붙인다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([
      plan("a", { exercises: [ex("점프 스쿼트")] }),
    ]);
    const result = await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-13",
      exercises: [ex("풀업"), ex("점프 스쿼트")],
    });
    expect(mocks.createWorkoutPlan).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: false, skippedCount: 1 });
    expect(result.plan.exercises.map((e) => e.name)).toEqual(["점프 스쿼트", "풀업"]);
  });

  it("더할 것이 전부 이미 있으면 쓰지 않는다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([
      plan("a", { exercises: [ex("풀업")] }),
    ]);
    const result = await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-13",
      exercises: [ex("풀업")],
    });
    expect(mocks.updateWorkoutPlan).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: false, skippedCount: 1 });
  });
});

describe("settlePlanAfterWorkout", () => {
  it("하나도 안 한 종목만 남긴다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(
      plan("a", { exercises: [ex("점프 스쿼트"), ex("풀업")] }),
    );
    await settlePlanAfterWorkout("a", [
      { name: "점프 스쿼트", sets: [{ done: true }] },
      { name: "풀업", sets: [{ done: false }] },
    ]);
    expect(mocks.updateWorkoutPlan).toHaveBeenCalledWith({
      planId: "a",
      sourceSessionId: null,
      exercises: [ex("풀업")],
      tabataMinutes: null,
    });
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });

  it("다 했으면 지운다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(plan("a", { exercises: [ex("풀업")] }));
    await settlePlanAfterWorkout("a", [{ name: "풀업", sets: [{ done: true }] }]);
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("a");
  });

  it("계획 종목을 하나도 안 했으면 그대로 둔다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(plan("a", { exercises: [ex("풀업")] }));
    await settlePlanAfterWorkout("a", [{ name: "푸시업", sets: [{ done: true }] }]);
    expect(mocks.updateWorkoutPlan).not.toHaveBeenCalled();
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });

  it("인터벌·프로그램 회차는 예전처럼 통째로 지운다 — 회차 진행률은 세션이 센다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(plan("p", { programEnrollmentId: "e1" }));
    await settlePlanAfterWorkout("p", []);
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("p");
  });

  it("이미 없어진 계획이면 아무것도 안 한다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(null);
    await settlePlanAfterWorkout("x", []);
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });
});

describe("consolidateUpcomingPlans", () => {
  it("오늘 이후 중복 날짜만 합치고 전체 목록을 갈아 끼운다", async () => {
    const old1 = plan("o1", { planDate: "2026-10-12" });
    const old2 = plan("o2", { planDate: "2026-10-12" });
    const t1 = plan("t1");
    const t2 = plan("t2");
    mocks.getWorkoutPlansByDate.mockResolvedValue([t1, t2]);

    const result = await consolidateUpcomingPlans(
      "u1",
      [old1, old2, t1, t2],
      "2026-10-13",
    );

    expect(mocks.getWorkoutPlansByDate).toHaveBeenCalledTimes(1);
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("t2");
    expect(result.map((p) => p.id)).toEqual(["o1", "o2", "t1"]);
  });
});
