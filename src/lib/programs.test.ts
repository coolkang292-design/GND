import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogExercise } from "@/lib/types";
import {
  OFFICIAL_PROGRAMS,
  resolveProgram,
} from "@/lib/domain/official-programs";
import { buildProgramSchedule } from "@/lib/domain/program-schedule";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}));

import {
  buildCreateProgramEnrollmentRpcArgs,
  createProgramEnrollment,
  getActiveProgramEnrollments,
  rescheduleProgramPlans,
} from "./programs";

const slots = [
  { weekday: 1 as const, time: "19:00" },
  { weekday: 3 as const, time: "19:00" },
  { weekday: 5 as const, time: "18:00" },
];

function catalogForProgram(program = OFFICIAL_PROGRAMS[0]): CatalogExercise[] {
  return [
    ...new Set(
      program.sessions.flatMap((session) =>
        session.exercises.map((exercise) => exercise.exerciseName),
      ),
    ),
  ].map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name,
    body_part: index % 2 === 0 ? "어깨" : "등",
    exercise_type: "weight",
    measure: null,
    is_custom: false,
    created_by: null,
    created_at: "2026-08-12T00:00:00.000Z",
  }));
}

function createInput(levelAtStart: "beginner" | "experienced") {
  const program = OFFICIAL_PROGRAMS[0];
  return {
    program,
    sessions: resolveProgram(program, catalogForProgram(program)),
    schedule: buildProgramSchedule({
      startDate: "2026-08-17",
      slots,
      timeZone: "Asia/Seoul",
      occupiedDates: new Set(),
    }).plans,
    levelAtStart,
    startDate: "2026-08-17",
    timeZone: "Asia/Seoul",
    preferredSlots: slots,
  };
}

function queryReturning(response: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockResolvedValue(response);
  mocks.from.mockReturnValue(query);
  return query;
}

beforeEach(() => vi.clearAllMocks());

describe("buildCreateProgramEnrollmentRpcArgs", () => {
  it.each(["beginner", "experienced"] as const)(
    "%s 세트 수와 처방을 보존한 18회 RPC payload를 만든다",
    (level) => {
      const input = createInput(level);
      const args = buildCreateProgramEnrollmentRpcArgs(input);

      expect(args).toMatchObject({
        p_program_key: input.program.key,
        p_program_version: 1,
        p_title_snapshot: input.program.title,
        p_level_at_start: level,
        p_start_date: "2026-08-17",
        p_timezone: "Asia/Seoul",
        p_preferred_slots: slots,
      });
      expect(args.p_plans).toHaveLength(18);
      expect(args.p_plans.map((plan) => [plan.week, plan.session])).toEqual(
        Array.from({ length: 18 }, (_, index) => [
          Math.floor(index / 3) + 1,
          (index % 3) + 1,
        ]),
      );

      const firstTemplate = input.sessions[0].exercises[0];
      const first = args.p_plans[0];
      expect(first).toMatchObject({
        plan_date: "2026-08-17",
        scheduled_at: "2026-08-17T10:00:00.000Z",
        week: 1,
        session: 1,
        template_key: "A",
        title: `${input.program.title} · ${input.sessions[0].title}`,
      });
      expect(first.exercises).toHaveLength(5);
      expect(first.exercises[0]).toEqual({
        name: firstTemplate.item.name,
        bodyPart: firstTemplate.item.body_part,
        exerciseType: firstTemplate.item.exercise_type,
        measure: firstTemplate.item.measure,
        isCustom: firstTemplate.item.is_custom,
        sets: Array.from(
          {
            length:
              level === "beginner"
                ? firstTemplate.beginnerSets
                : firstTemplate.experiencedSets,
          },
          () => ({
            weightKg: 0,
            reps: 0,
            distanceKm: 0,
            durationMin: 0,
          }),
        ),
        prescription: {
          repsMin: firstTemplate.repsMin,
          repsMax: firstTemplate.repsMax,
          targetRir: firstTemplate.targetRir,
          restSeconds: firstTemplate.restSeconds,
          loadStepKg: firstTemplate.loadStepKg,
        },
      });
      expect(
        args.p_plans.every(
          (plan) => plan.exercises.length >= 5 && plan.exercises.length <= 6,
        ),
      ).toBe(true);
    },
  );

  it("18회가 아니거나 template이 없으면 서버 호출 전에 거부한다", () => {
    const input = createInput("beginner");
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({
        ...input,
        schedule: input.schedule.slice(0, 17),
      }),
    ).toThrow("program_plans_count");
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({
        ...input,
        sessions: input.sessions.slice(0, 2),
      }),
    ).toThrow("program_template_missing:C");
  });
});

describe("program enrollment I/O", () => {
  it("create RPC에 builder payload를 넘기고 UUID를 반환한다", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    mocks.rpc.mockResolvedValue({ data: id, error: null });
    const input = createInput("beginner");

    await expect(createProgramEnrollment(input)).resolves.toBe(id);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_program_enrollment",
      buildCreateProgramEnrollmentRpcArgs(input),
    );
  });

  it("create RPC의 Supabase 오류 객체를 그대로 던진다", async () => {
    const error = { message: "program_plan_date_taken:2026-08-17", code: "P0001" };
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(createProgramEnrollment(createInput("beginner"))).rejects.toBe(
      error,
    );
  });

  it("본인 active enrollment만 시작일 순으로 조회하고 정상 행만 복원한다", async () => {
    const valid = {
      id: "11111111-1111-4111-8111-111111111111",
      program_key: "shoulder-frame-6w",
      program_version: 1,
      title_snapshot: "상체의 틀을 넓히는 6주",
      level_at_start: "beginner",
      start_date: "2026-08-17",
      timezone: "Asia/Seoul",
      preferred_slots: slots,
      status: "active",
    };
    const query = queryReturning({
      data: [valid, { ...valid, preferred_slots: [{ weekday: 1, time: "oops" }] }],
      error: null,
    });

    await expect(getActiveProgramEnrollments("user-1")).resolves.toEqual([
      {
        id: valid.id,
        programKey: valid.program_key,
        programVersion: 1,
        title: valid.title_snapshot,
        levelAtStart: "beginner",
        startDate: valid.start_date,
        timeZone: valid.timezone,
        preferredSlots: slots,
        status: "active",
      },
    ]);
    expect(mocks.from).toHaveBeenCalledWith("program_enrollments");
    expect(query.eq.mock.calls).toEqual([
      ["user_id", "user-1"],
      ["status", "active"],
    ]);
    expect(query.order).toHaveBeenCalledWith("start_date", { ascending: true });
  });

  it("조회 오류를 그대로 던진다", async () => {
    const error = { message: "permission denied", code: "42501" };
    queryReturning({ data: null, error });
    await expect(getActiveProgramEnrollments("user-1")).rejects.toBe(error);
  });

  it("재배치 move를 RPC snake_case로 바꾸고 오류를 그대로 던진다", async () => {
    const move = {
      planId: "22222222-2222-4222-8222-222222222222",
      fromDate: "2026-08-17",
      suggestedDate: "2026-08-19",
      scheduledAt: "2026-08-19T10:00:00.000Z",
    };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await rescheduleProgramPlans({
      enrollmentId: "11111111-1111-4111-8111-111111111111",
      moves: [move],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("reschedule_program_plans", {
      p_enrollment_id: "11111111-1111-4111-8111-111111111111",
      p_moves: [
        {
          plan_id: move.planId,
          plan_date: move.suggestedDate,
          scheduled_at: move.scheduledAt,
        },
      ],
    });

    const error = { message: "program_plan_date_taken", code: "P0001" };
    mocks.rpc.mockResolvedValueOnce({ data: null, error });
    await expect(
      rescheduleProgramPlans({
        enrollmentId: "11111111-1111-4111-8111-111111111111",
        moves: [move],
      }),
    ).rejects.toBe(error);
  });

  it("빈 재배치는 RPC를 부르지 않는 no-op이다", async () => {
    await expect(
      rescheduleProgramPlans({
        enrollmentId: "11111111-1111-4111-8111-111111111111",
        moves: [],
      }),
    ).resolves.toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
