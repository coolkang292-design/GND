import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
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

function exercises(prefix: string, count: number): PlanExercise[] {
  return Array.from({ length: count }, (_, i) => ex(`${prefix}-${i}`));
}

// sourceSessionId를 null이 아닌 값으로 둔다 — null이면 "넘기지 않아 null로 덮이는" 회귀를
// 못 잡는다 (update에 sourceSessionId를 빼먹어도 null === null로 통과한다)
function plan(id: string, over: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id,
    userId: "u1",
    planDate: "2026-10-13",
    sourceSessionId: "s1",
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

let warn: MockInstance;

beforeEach(() => {
  // clearAllMocks는 mockResolvedValueOnce 대기열을 비우지 않는다 — 테스트끼리 새지 않게 리셋
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.updateWorkoutPlan.mockImplementation(async (input) =>
    plan(input.planId, { exercises: input.exercises, updatedAt: "u2" }),
  );
  mocks.createWorkoutPlan.mockImplementation(async (input) =>
    plan("new", { planDate: input.planDate, exercises: input.exercises }),
  );
  mocks.deleteWorkoutPlan.mockResolvedValue(undefined);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
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
      sourceSessionId: "s1",
      exercises: [ex("점프 스쿼트"), ex("풀업")],
      tabataMinutes: null,
    });
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("b");
    // 고치기가 지우기보다 먼저다 — 지우기만 성공하고 고치기가 실패하면 종목이 사라진다
    expect(mocks.updateWorkoutPlan.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteWorkoutPlan.mock.invocationCallOrder[0],
    );
    expect(result.map((p) => p.id)).toEqual(["a", "i"]);
    expect(result[0].exercises.map((e) => e.name)).toEqual(["점프 스쿼트", "풀업"]);
  });

  it("중복이 없으면 쓰지 않는다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([plan("a")]);
    await consolidateDayPlans("u1", "2026-10-13");
    expect(mocks.updateWorkoutPlan).not.toHaveBeenCalled();
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });

  it("고치기가 실패하면 아무것도 지우지 않고 원래 목록을 돌려준다 — 종목 손실 방지", async () => {
    const plans = [
      plan("a", { exercises: [ex("점프 스쿼트")] }),
      plan("b", { exercises: [ex("풀업")] }),
    ];
    mocks.getWorkoutPlansByDate.mockResolvedValue(plans);
    mocks.updateWorkoutPlan.mockRejectedValue(new Error("past_plan_locked"));

    const result = await consolidateDayPlans("u1", "2026-10-13");

    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
    expect(result).toEqual(plans);
    expect(warn).toHaveBeenCalledWith("[day-plan] 같은 날 계획 합치기 실패", expect.any(Error));
  });

  it("지우기가 실패한 계획은 목록에 남긴다 — 목록이 DB와 같아야 한다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([
      plan("a", { exercises: [ex("점프 스쿼트")] }),
      plan("b", { exercises: [ex("풀업")] }),
      plan("c", { exercises: [ex("푸시업")] }),
    ]);
    mocks.deleteWorkoutPlan.mockImplementation(async (id: string) => {
      if (id === "b") throw new Error("network");
    });

    const result = await consolidateDayPlans("u1", "2026-10-13");

    // b가 실패해도 c는 시도한다
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("b");
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("c");
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
    expect(warn).toHaveBeenCalled();
  });

  it("새로 들어갈 종목이 없으면 고치지 않고 지우기만 한다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([
      plan("a", { exercises: [ex("풀업"), ex("점프 스쿼트")] }),
      plan("b", { exercises: [ex(" 풀업 ")] }),
    ]);

    const result = await consolidateDayPlans("u1", "2026-10-13");

    expect(mocks.updateWorkoutPlan).not.toHaveBeenCalled();
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("b");
    expect(result.map((p) => p.id)).toEqual(["a"]);
    expect(result[0].exercises.map((e) => e.name)).toEqual(["풀업", "점프 스쿼트"]);
  });

  it("50개를 넘기게 되면 합치지 않는다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([
      plan("a", { exercises: exercises("a", 40) }),
      plan("b", { exercises: exercises("b", 11) }),
    ]);
    const result = await consolidateDayPlans("u1", "2026-10-13");
    expect(mocks.updateWorkoutPlan).not.toHaveBeenCalled();
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("읽기 실패는 그대로 던진다", async () => {
    mocks.getWorkoutPlansByDate.mockRejectedValue(new Error("read failed"));
    await expect(consolidateDayPlans("u1", "2026-10-13")).rejects.toThrow("read failed");
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
    expect(result.overflowCount).toBe(0);
    expect(mocks.createWorkoutPlan).toHaveBeenCalledWith({
      userId: "u1",
      planDate: "2026-10-13",
      sourceSessionId: null,
      exercises: [ex("풀업")],
    });
    expect(result.dayPlans.map((p) => p.id)).toEqual(["i", "new"]);
  });

  it("만들 때도 중복·빈 이름을 걸러서 만든다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([]);
    const result = await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-13",
      exercises: [ex("풀업"), ex(" 풀업 "), ex("  "), ex("푸시업")],
    });
    expect(mocks.createWorkoutPlan).toHaveBeenCalledWith({
      userId: "u1",
      planDate: "2026-10-13",
      sourceSessionId: null,
      exercises: [ex("풀업"), ex("푸시업")],
    });
    expect(result).toMatchObject({ created: true, skippedCount: 2, overflowCount: 0 });
  });

  it("넘겨받은 sourceSessionId를 만들 때 그대로 싣는다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([]);
    await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-13",
      exercises: [ex("풀업")],
      sourceSessionId: "s9",
    });
    expect(mocks.createWorkoutPlan).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSessionId: "s9" }),
    );
  });

  it("담을 종목이 하나도 없으면 만들지 않고 invalid_workout_plan으로 거절한다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([]);
    await expect(
      addToDayPlan({
        userId: "u1",
        planDate: "2026-10-13",
        exercises: [ex(" "), ex("")],
      }),
    ).rejects.toThrow("invalid_workout_plan");
    expect(mocks.createWorkoutPlan).not.toHaveBeenCalled();
  });

  it("만들 때 50개를 넘는 종목은 빼고 overflowCount로 알린다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([]);
    const result = await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-13",
      exercises: exercises("x", 52),
    });
    expect(mocks.createWorkoutPlan.mock.calls[0][0].exercises).toHaveLength(50);
    expect(result).toMatchObject({ created: true, overflowCount: 2 });
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
    expect(mocks.updateWorkoutPlan).toHaveBeenCalledWith({
      planId: "a",
      sourceSessionId: "s1",
      exercises: [ex("점프 스쿼트"), ex("풀업")],
      tabataMinutes: null,
    });
    expect(result).toMatchObject({ created: false, skippedCount: 1, overflowCount: 0 });
    expect(result.plan.exercises.map((e) => e.name)).toEqual(["점프 스쿼트", "풀업"]);
  });

  it("붙일 때 50개를 넘는 종목은 빼고 overflowCount로 알린다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([
      plan("a", { exercises: exercises("a", 49) }),
    ]);
    const result = await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-13",
      exercises: [ex("x"), ex("y"), ex("z")],
    });
    expect(mocks.updateWorkoutPlan.mock.calls[0][0].exercises).toHaveLength(50);
    expect(result).toMatchObject({ created: false, skippedCount: 0, overflowCount: 2 });
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
    expect(result).toMatchObject({ created: false, skippedCount: 1, overflowCount: 0 });
  });

  it("같은 날 동시에 두 번 불러도 계획을 하나만 만든다 — 더블탭", async () => {
    const created = plan("new", { exercises: [ex("풀업")] });
    // 첫 호출은 빈 날을 보고, 직렬화돼 있으면 둘째는 첫 호출이 만든 계획을 본다
    mocks.getWorkoutPlansByDate.mockResolvedValueOnce([]).mockResolvedValueOnce([created]);
    mocks.createWorkoutPlan.mockResolvedValue(created);

    const [first, second] = await Promise.all([
      addToDayPlan({ userId: "u1", planDate: "2026-10-13", exercises: [ex("풀업")] }),
      addToDayPlan({ userId: "u1", planDate: "2026-10-13", exercises: [ex("푸시업")] }),
    ]);

    expect(mocks.createWorkoutPlan).toHaveBeenCalledTimes(1);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(mocks.updateWorkoutPlan).toHaveBeenCalledWith(
      expect.objectContaining({ planId: "new", exercises: [ex("풀업"), ex("푸시업")] }),
    );
    // 둘째의 읽기는 첫째의 만들기가 끝난 뒤여야 한다 — 직렬화의 증거
    expect(mocks.getWorkoutPlansByDate.mock.invocationCallOrder[1]).toBeGreaterThan(
      mocks.createWorkoutPlan.mock.invocationCallOrder[0],
    );
  });

  it("앞 호출이 실패해도 뒤 호출은 막히지 않는다", async () => {
    mocks.getWorkoutPlansByDate
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValueOnce([]);

    const [first, second] = await Promise.allSettled([
      addToDayPlan({ userId: "u1", planDate: "2026-10-13", exercises: [ex("풀업")] }),
      addToDayPlan({ userId: "u1", planDate: "2026-10-13", exercises: [ex("푸시업")] }),
    ]);

    expect(first.status).toBe("rejected");
    expect(second.status).toBe("fulfilled");
    expect(mocks.createWorkoutPlan).toHaveBeenCalledTimes(1);
  });

  it("날짜가 다르면 서로 기다리지 않는다", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.getWorkoutPlansByDate.mockResolvedValue([]);
    mocks.createWorkoutPlan.mockImplementationOnce(async (input) => {
      await gate;
      return plan("late", { planDate: input.planDate, exercises: input.exercises });
    });

    const slow = addToDayPlan({ userId: "u1", planDate: "2026-10-13", exercises: [ex("풀업")] });
    const fast = await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-14",
      exercises: [ex("푸시업")],
    });
    // 첫 날짜의 만들기가 아직 막혀 있는데도 다른 날짜는 끝났다
    expect(fast.created).toBe(true);
    release();
    await slow;
  });
});

describe("settlePlanAfterWorkout", () => {
  it("하나도 안 한 종목만 남긴다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(
      plan("a", { exercises: [ex("점프 스쿼트"), ex("풀업")] }),
    );
    const result = await settlePlanAfterWorkout("a", [
      { name: "점프 스쿼트", sets: [{ done: true }] },
      { name: "풀업", sets: [{ done: false }] },
    ]);
    expect(result).toBe("trimmed");
    expect(mocks.updateWorkoutPlan).toHaveBeenCalledWith({
      planId: "a",
      sourceSessionId: "s1",
      exercises: [ex("풀업")],
      tabataMinutes: null,
    });
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });

  it("다 했으면 지운다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(plan("a", { exercises: [ex("풀업")] }));
    const result = await settlePlanAfterWorkout("a", [
      { name: "풀업", sets: [{ done: true }] },
    ]);
    expect(result).toBe("deleted");
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("a");
  });

  it("계획 종목을 하나도 안 했으면 그대로 둔다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(plan("a", { exercises: [ex("풀업")] }));
    const result = await settlePlanAfterWorkout("a", [
      { name: "푸시업", sets: [{ done: true }] },
    ]);
    expect(result).toBe("kept");
    expect(mocks.updateWorkoutPlan).not.toHaveBeenCalled();
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });

  it("인터벌·프로그램 회차는 예전처럼 통째로 지운다 — 회차 진행률은 세션이 센다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(plan("p", { programEnrollmentId: "e1" }));
    expect(await settlePlanAfterWorkout("p", [])).toBe("deleted");
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("p");

    mocks.deleteWorkoutPlan.mockClear();
    mocks.getWorkoutPlanById.mockResolvedValue(plan("t", { tabataMinutes: 8 }));
    expect(await settlePlanAfterWorkout("t", [])).toBe("deleted");
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("t");
  });

  it("이미 없어진 계획이면 아무것도 안 한다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(null);
    const result = await settlePlanAfterWorkout("x", []);
    expect(result).toBe("gone");
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });

  // 자정 전에 시작한 운동을 자정 뒤에 끝내면 그 계획은 이미 지난 계획이다(0116).
  // DB가 막는 것이 정상이고, 계획은 기록으로 남는다 — 실패가 아니다
  it.each([
    ["past_plan_locked 메시지", new Error("past_plan_locked")],
    ["past_plan_date 메시지", new Error("past_plan_date")],
    [
      "PostgREST 객체의 메시지",
      { code: "P0001", message: "past_plan_locked: 지난 계획은 고칠 수 없다" },
    ],
    ["RLS로 행이 안 보이는 PGRST116", { code: "PGRST116", message: "0 rows" }],
    ["메시지 없는 PGRST116", { code: "PGRST116" }],
  ])("고치기가 지난 계획이라 막히면 locked — %s", async (_label, error) => {
    mocks.getWorkoutPlanById.mockResolvedValue(
      plan("a", { exercises: [ex("점프 스쿼트"), ex("풀업")] }),
    );
    mocks.updateWorkoutPlan.mockRejectedValue(error);
    const result = await settlePlanAfterWorkout("a", [
      { name: "점프 스쿼트", sets: [{ done: true }] },
    ]);
    expect(result).toBe("locked");
  });

  it("지우기가 지난 계획이라 막혀도 locked", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(plan("a", { exercises: [ex("풀업")] }));
    mocks.deleteWorkoutPlan.mockRejectedValue(new Error("past_plan_locked"));
    const result = await settlePlanAfterWorkout("a", [
      { name: "풀업", sets: [{ done: true }] },
    ]);
    expect(result).toBe("locked");
  });

  it("그 밖의 쓰기 오류는 다시 던진다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(
      plan("a", { exercises: [ex("점프 스쿼트"), ex("풀업")] }),
    );
    mocks.updateWorkoutPlan.mockRejectedValue(new Error("network down"));
    await expect(
      settlePlanAfterWorkout("a", [{ name: "점프 스쿼트", sets: [{ done: true }] }]),
    ).rejects.toThrow("network down");
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

  it("중복 날짜가 둘이면 둘 다 합친다", async () => {
    const t1 = plan("t1");
    const t2 = plan("t2");
    const f1 = plan("f1", { planDate: "2026-10-20" });
    const f2 = plan("f2", { planDate: "2026-10-20" });
    mocks.getWorkoutPlansByDate.mockImplementation(async (_userId: string, date: string) =>
      date === "2026-10-13" ? [t1, t2] : [f1, f2],
    );

    const result = await consolidateUpcomingPlans("u1", [t1, t2, f1, f2], "2026-10-13");

    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("t2");
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("f2");
    expect(result.map((p) => p.id)).toEqual(["t1", "f1"]);
  });

  it("한 날짜의 읽기가 실패해도 던지지 않고 다른 날짜는 합친다", async () => {
    const t1 = plan("t1");
    const t2 = plan("t2");
    const f1 = plan("f1", { planDate: "2026-10-20" });
    const f2 = plan("f2", { planDate: "2026-10-20" });
    mocks.getWorkoutPlansByDate.mockImplementation(async (_userId: string, date: string) => {
      if (date === "2026-10-13") throw new Error("read failed");
      return [f1, f2];
    });

    const result = await consolidateUpcomingPlans("u1", [t1, t2, f1, f2], "2026-10-13");

    // 실패한 날짜는 받은 그대로, 성공한 날짜는 합쳐진 채로
    expect(result.map((p) => p.id)).toEqual(["t1", "t2", "f1"]);
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledTimes(1);
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("f2");
    expect(warn).toHaveBeenCalled();
  });

  it("날짜 순서를 지킨다 — 오늘 중복 + 미래 계획", async () => {
    const t1 = plan("t1");
    const t2 = plan("t2");
    const f1 = plan("f1", { planDate: "2026-10-20" });
    mocks.getWorkoutPlansByDate.mockResolvedValue([t1, t2]);

    const result = await consolidateUpcomingPlans("u1", [t1, t2, f1], "2026-10-13");

    expect(result.map((p) => p.id)).toEqual(["t1", "f1"]);
  });

  it("같은 날 안에서는 예정 시각 없는 계획이 먼저, 그다음 예정 시각 순이다", async () => {
    const t1 = plan("t1");
    const t2 = plan("t2");
    const timed = plan("timed", { tabataMinutes: 8, scheduledAt: "2026-10-13T09:00:00+00:00" });
    const early = plan("early", {
      tabataMinutes: 4,
      scheduledAt: "2026-10-13T07:00:00+00:00",
    });
    const f1 = plan("f1", { planDate: "2026-10-20" });
    mocks.getWorkoutPlansByDate.mockResolvedValue([t1, early, timed, t2]);

    const result = await consolidateUpcomingPlans(
      "u1",
      [t1, early, timed, t2, f1],
      "2026-10-13",
    );

    expect(result.map((p) => p.id)).toEqual(["t1", "early", "timed", "f1"]);
  });

  it("예정 시각이 같으면 만든 순서로 둔다", async () => {
    const early = plan("early", { tabataMinutes: 4, createdAt: "2026-10-01T00:00:00+00:00" });
    const late = plan("late", { tabataMinutes: 8, createdAt: "2026-10-02T00:00:00+00:00" });
    const t1 = plan("t1", { createdAt: "2026-10-03T00:00:00+00:00" });
    const t2 = plan("t2", { createdAt: "2026-10-04T00:00:00+00:00" });
    mocks.getWorkoutPlansByDate.mockResolvedValue([late, early, t1, t2]);

    const result = await consolidateUpcomingPlans("u1", [late, early, t1, t2], "2026-10-13");

    expect(result.map((p) => p.id)).toEqual(["early", "late", "t1"]);
  });
});
