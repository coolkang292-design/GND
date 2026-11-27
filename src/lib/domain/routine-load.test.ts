import { describe, expect, it } from "vitest";
import { emptyDraft, type LocalExercise, type WorkoutDraft } from "@/lib/workout";
import type { PlanExercise } from "./workout-plan";
import {
  buildRoutineReplacement,
  decideRoutineLoad,
  routineLoadSummary,
} from "./routine-load";

/*
  2026-11-27 재현(픽스처 B, 개발 서버)에서 나온 숫자를 그대로 픽스처로 쓴다.
  - A: 풀(스쿼트 4세트) 위에 데일리(스쿼트 3세트) → 4세트가 남았다
  - B: 평일(힙 어덕션 20회) 위에 평일오후(25회) → 20회가 남았다
  - C: 퀘스트 아래 '내 루틴' 타일 → 겹치는 종목이 통째로 사라졌다
*/

function planEx(name: string, reps: number[], weightKg = 0): PlanExercise {
  return {
    name,
    bodyPart: "하체",
    exerciseType: weightKg > 0 ? "weight" : "bodyweight",
    measure: weightKg > 0 ? null : "reps",
    isCustom: false,
    sets: reps.map((r) => ({ weightKg, reps: r, distanceKm: 0, durationMin: 0 })),
  };
}

function localEx(name: string, reps: number[], weightKg = 0): LocalExercise {
  return {
    key: `k-${name}`,
    name,
    bodyPart: "하체",
    exerciseType: weightKg > 0 ? "weight" : "bodyweight",
    measure: weightKg > 0 ? null : "reps",
    isCustom: false,
    sets: reps.map((r, i) => ({
      key: `s-${name}-${i}`,
      weightKg,
      reps: r,
      distanceKm: 0,
      durationMin: 0,
      done: false,
    })),
  };
}

function draft(over: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return { ...emptyDraft(), ...over };
}

let seq = 0;
const makeKey = () => `new-${seq++}`;

describe("decideRoutineLoad", () => {
  it("빈 목록이면 묻지 않고 교체한다", () => {
    expect(
      decideRoutineLoad({ draft: draft(), fromTile: false, hasUnboundTodayPlan: false }),
    ).toBe("replace");
  });

  it("앱이 담아 준 제안(퀘스트)뿐이면 묻지 않고 교체한다", () => {
    expect(
      decideRoutineLoad({
        draft: draft({
          exercises: [localEx("푸시업", [12])],
          suggestedForDayKey: "2026-11-28",
        }),
        fromTile: false,
        hasUnboundTodayPlan: false,
      }),
    ).toBe("replace");
  });

  it("사용자가 직접 담은 목록이 있으면 묻는다", () => {
    expect(
      decideRoutineLoad({
        draft: draft({ exercises: [localEx("맨몸 스쿼트", [10, 10, 10, 10])] }),
        fromTile: false,
        hasUnboundTodayPlan: false,
      }),
    ).toBe("ask");
  });

  it("달력 계획에 묶인 목록이면 묻는다", () => {
    expect(
      decideRoutineLoad({
        draft: draft({
          exercises: [localEx("맨몸 스쿼트", [10])],
          scheduledPlanId: "plan-1",
        }),
        fromTile: false,
        hasUnboundTodayPlan: false,
      }),
    ).toBe("ask");
  });

  it("퀘스트 아래 '내 루틴' 타일은 '내 방법으로 시작'이라 언제나 교체한다", () => {
    expect(
      decideRoutineLoad({
        draft: draft({ exercises: [localEx("맨몸 스쿼트", [10, 10, 10, 10])] }),
        fromTile: true,
        hasUnboundTodayPlan: false,
      }),
    ).toBe("replace");
  });

  it("⚠️ 운동이 시작됐으면 무엇으로 열었든 추가만 한다 — 진행 중 기록 보호", () => {
    for (const fromTile of [true, false]) {
      expect(
        decideRoutineLoad({
          draft: draft({
            exercises: [localEx("맨몸 스쿼트", [10])],
            sessionId: "s-1",
            startedAtMs: 1,
          }),
          fromTile,
          hasUnboundTodayPlan: false,
        }),
      ).toBe("add-only");
    }
  });

  it("⚠️ 세션만 열리고 시작 응답 전이어도 추가만 한다 (그 목록은 세션 것이다)", () => {
    expect(
      decideRoutineLoad({
        draft: draft({ exercises: [localEx("맨몸 스쿼트", [10])], sessionId: "s-1" }),
        fromTile: false,
        hasUnboundTodayPlan: false,
      }),
    ).toBe("add-only");
  });

  it("제안 목록이라도 달력에 아직 안 묶인 오늘 계획이 있으면 묻는다 — 계획을 몰래 덮지 않는다", () => {
    expect(
      decideRoutineLoad({
        draft: draft({
          exercises: [localEx("푸시업", [12])],
          suggestedForDayKey: "2026-11-28",
        }),
        fromTile: false,
        hasUnboundTodayPlan: true,
      }),
    ).toBe("ask");
  });
});

describe("buildRoutineReplacement", () => {
  it("시나리오 A — 풀(4세트) 위에 데일리(3세트)를 부르면 3세트가 된다", () => {
    const current = draft({
      exercises: [localEx("맨몸 스쿼트", [10, 10, 10, 10]), localEx("매달리기", [0, 0])],
      scheduledPlanId: "plan-1",
    });
    const daily = [planEx("걷기", [0]), planEx("맨몸 스쿼트", [10, 10, 10]), planEx("푸시업", [10, 10, 10])];

    const next = buildRoutineReplacement({ draft: current, routine: daily, makeKey, bindPlanId: null });

    expect(next.exercises.map((e) => e.name)).toEqual(["걷기", "맨몸 스쿼트", "푸시업"]);
    expect(next.exercises[1].sets).toHaveLength(3);
    expect(next.exercises.some((e) => e.name === "매달리기")).toBe(false);
  });

  it("시나리오 B — 평일(20회) 위에 평일오후(25회)를 부르면 25회가 된다", () => {
    const current = draft({ exercises: [localEx("힙 어덕션 머신", [20, 20, 20], 25)] });
    const afternoon = [planEx("싸이클", [0]), planEx("힙 어덕션 머신", [25, 25, 25], 25)];

    const next = buildRoutineReplacement({ draft: current, routine: afternoon, makeKey, bindPlanId: null });

    expect(next.exercises[0].name).toBe("싸이클"); // 루틴 순서 그대로
    expect(next.exercises[1].sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [25, 25],
      [25, 25],
      [25, 25],
    ]);
  });

  it("새 키·미완료·체감 없음으로 복사본을 만든다 (TASK 04)", () => {
    const routine = [planEx("맨몸 스쿼트", [10, 10])];
    const next = buildRoutineReplacement({ draft: draft(), routine, makeKey, bindPlanId: null });

    const keys = [next.exercises[0].key, ...next.exercises[0].sets.map((s) => s.key)];
    expect(new Set(keys).size).toBe(3);
    expect(next.exercises[0].sets.every((s) => s.done === false)).toBe(true);
    expect(next.exercises[0].sets.every((s) => (s.effortFeedback ?? null) === null)).toBe(true);
  });

  it("⚠️ 원본 루틴 객체를 건드리지 않는다 — 오늘 목록을 고쳐도 루틴은 그대로다", () => {
    const routine = [planEx("맨몸 스쿼트", [10, 10, 10])];
    const before = JSON.stringify(routine);
    const next = buildRoutineReplacement({ draft: draft(), routine, makeKey, bindPlanId: null });

    next.exercises[0].sets[0].reps = 99;
    next.exercises[0].sets.push({ ...next.exercises[0].sets[0], key: "x" });

    expect(JSON.stringify(routine)).toBe(before);
  });

  it("⚠️ 제안 도장을 지운다 — 남겨 두면 계획에 안 써지고, 계획에 덮이고, 자정에 지워진다", () => {
    const next = buildRoutineReplacement({
      draft: draft({ exercises: [localEx("푸시업", [12])], suggestedForDayKey: "2026-11-28" }),
      routine: [planEx("푸시업", [10, 10, 10])],
      makeKey,
      bindPlanId: null,
    });

    expect(next.suggestedForDayKey).toBeNull();
    expect(next.exercises[0].sets).toHaveLength(3);
  });

  it("지난 기록 노력 제안·복사 원본을 지운다 — 이제 루틴 목록이다", () => {
    const next = buildRoutineReplacement({
      draft: draft({ effortMessage: "지난번 12회", sourceSessionId: "sess-1" }),
      routine: [planEx("푸시업", [10])],
      makeKey,
      bindPlanId: null,
    });

    expect(next.effortMessage).toBeNull();
    expect(next.sourceSessionId).toBeNull();
  });

  it("일반 계획에 묶여 있으면 묶음을 유지한다 — 다음 쓰기가 계획을 루틴으로 바꾼다", () => {
    const next = buildRoutineReplacement({
      draft: draft({ exercises: [localEx("맨몸 스쿼트", [10])], scheduledPlanId: "plan-1" }),
      routine: [planEx("푸시업", [10])],
      makeKey,
      bindPlanId: "other-plan",
    });

    expect(next.scheduledPlanId).toBe("plan-1");
  });

  it("안 묶였고 오늘 계획을 넘겨받으면 그 계획에 묶는다 — 합치기(계획 값이 이김) 대신 교체", () => {
    const next = buildRoutineReplacement({
      draft: draft({ exercises: [localEx("맨몸 스쿼트", [10])] }),
      routine: [planEx("푸시업", [10])],
      makeKey,
      bindPlanId: "today-plan",
    });

    expect(next.scheduledPlanId).toBe("today-plan");
  });

  it("인터벌·프로그램에 묶인 목록이면 그 표식과 묶음을 전부 푼다", () => {
    const next = buildRoutineReplacement({
      draft: draft({
        exercises: [localEx("버피", [0])],
        tabataMinutes: 4,
        intervalStartIndex: 2,
        program: { enrollmentId: "e", week: 1, session: 1, templateVersion: 1 },
        scheduledPlanId: "program-plan",
        sourceSessionId: "s",
      }),
      routine: [planEx("푸시업", [10])],
      makeKey,
      bindPlanId: "today-plan",
    });

    expect(next.tabataMinutes).toBeNull();
    expect(next.intervalStartIndex ?? 0).toBe(0);
    expect(next.program).toBeNull();
    // 특별 계획은 운동 탭이 고치지 않는다 — 넘겨받은 오늘 일반 계획에 새로 묶는다
    expect(next.scheduledPlanId).toBe("today-plan");
  });

  it("휴식 설정은 그대로 둔다 — 사용자 설정이지 목록이 아니다", () => {
    const next = buildRoutineReplacement({
      draft: draft({ restSeconds: 120 }),
      routine: [planEx("푸시업", [10])],
      makeKey,
      bindPlanId: null,
    });

    expect(next.restSeconds).toBe(120);
  });
});

describe("routineLoadSummary", () => {
  it("종목 수와 세트 수만 센다 — 이름·무게는 흔적에 남기지 않는다", () => {
    const text = routineLoadSummary([
      localEx("맨몸 스쿼트", [10, 10, 10, 10]),
      localEx("힙 어덕션 머신", [20, 20, 20], 25),
    ]);

    expect(text).toBe("2ex/7sets");
    expect(text).not.toMatch(/스쿼트|25/);
  });
});
