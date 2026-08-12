import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogExercise } from "@/lib/types";
import {
  STRENGTH_PROGRAMS,
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
  cancelProgramEnrollment,
  createProgramEnrollment,
  getActiveProgramEnrollments,
  rescheduleProgramPlans,
} from "./programs";

const slots = [
  { weekday: 1 as const, time: "19:00" },
  { weekday: 3 as const, time: "19:00" },
  { weekday: 5 as const, time: "18:00" },
];

function catalogForProgram(program = STRENGTH_PROGRAMS[0]): CatalogExercise[] {
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
  const program = STRENGTH_PROGRAMS[0];
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
        title: input.program.title,
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
    ).toThrow("program_template_keys");
  });

  it("프로그램 원본과 resolved session의 제목·종목·처방이 다르면 거부한다", () => {
    const input = createInput("beginner");
    const mismatchedTitle = structuredClone(input.sessions);
    mismatchedTitle[0].title = "다른 회차";
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({ ...input, sessions: mismatchedTitle }),
    ).toThrow("program_template_mismatch:A");

    const mismatchedPrescription = structuredClone(input.sessions);
    mismatchedPrescription[0].exercises[0].repsMax += 1;
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({
        ...input,
        sessions: mismatchedPrescription,
      }),
    ).toThrow("program_template_mismatch:A");
  });

  it("공식 시드가 아닌 custom item 또는 이름이 다른 item을 거부한다", () => {
    const input = createInput("beginner");
    const custom = structuredClone(input.sessions);
    custom[0].exercises[0].item.is_custom = true;
    custom[0].exercises[0].item.created_by = "user-1";
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({ ...input, sessions: custom }),
    ).toThrow("program_catalog_item_invalid:바벨 백스쿼트");

    const wrongName = structuredClone(input.sessions);
    wrongName[0].exercises[0].item.name = "다른 운동";
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({ ...input, sessions: wrongName }),
    ).toThrow("program_catalog_item_invalid:바벨 백스쿼트");
  });

  it("중복 날짜·순서가 깨진 일정·현지 날짜가 다른 예약시각을 거부한다", () => {
    const input = createInput("beginner");
    const duplicate = structuredClone(input.schedule);
    duplicate[1].date = duplicate[0].date;
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({ ...input, schedule: duplicate }),
    ).toThrow("program_plan_date_duplicate:2026-08-17");

    const wrongOrder = structuredClone(input.schedule);
    wrongOrder[0].week = 2;
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({ ...input, schedule: wrongOrder }),
    ).toThrow("program_invalid_slot_order");

    const wrongLocalDate = structuredClone(input.schedule);
    wrongLocalDate[0].scheduledAt = "2026-08-18T10:00:00.000Z";
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({ ...input, schedule: wrongLocalDate }),
    ).toThrow("program_scheduled_date_mismatch");
  });

  it("선호 시간·시작일·시간대를 검증하고 입력을 바꾸지 않는다", () => {
    const input = createInput("experienced");
    const before = structuredClone(input);
    buildCreateProgramEnrollmentRpcArgs(input);
    expect(input).toEqual(before);

    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({
        ...input,
        preferredSlots: input.preferredSlots.slice(0, 1),
      }),
    ).toThrow("program_slots_count");
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({ ...input, startDate: "2026-02-30" }),
    ).toThrow("program_invalid_start_date");
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({ ...input, timeZone: "Mars/Olympus" }),
    ).toThrow("program_invalid_timezone");
  });
});

describe("연속 요일 등록 (금·토·일)", () => {
  // 요일 간격 제한은 없앴다 (사용자 확정 2026-08-12). 화면·스케줄러·DB는 모두
  // 고쳤는데 이 파일의 parsePreferredSlots만 남아 있어서, 등록이 **서버에 가기도
  // 전에** program_invalid_slots로 죽었다. 회귀를 여기서 막는다.
  const consecutiveSlots = [
    { weekday: 0 as const, time: "19:00" },
    { weekday: 5 as const, time: "19:00" },
    { weekday: 6 as const, time: "19:00" },
  ];

  function consecutiveInput() {
    const program = STRENGTH_PROGRAMS[0];
    return {
      program,
      sessions: resolveProgram(program, catalogForProgram(program)),
      schedule: buildProgramSchedule({
        startDate: "2026-08-14",
        slots: consecutiveSlots,
        timeZone: "Asia/Seoul",
        occupiedDates: new Set<string>(),
      }).plans,
      levelAtStart: "beginner" as const,
      startDate: "2026-08-14",
      timeZone: "Asia/Seoul",
      preferredSlots: consecutiveSlots,
    };
  }

  it("금·토·일 18회를 RPC payload로 만든다", () => {
    const args = buildCreateProgramEnrollmentRpcArgs(consecutiveInput());

    expect(args.p_plans).toHaveLength(18);
    expect(args.p_plans.slice(0, 3).map((plan) => plan.plan_date)).toEqual([
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
    expect(args.p_preferred_slots).toEqual(consecutiveSlots);
  });

  it("연속 요일로 저장된 enrollment를 다시 읽을 수 있다", async () => {
    // 저장이 됐는데 조회가 fail-closed로 막히면 프로그램 화면 전체가 죽는다.
    queryReturning({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          program_key: "shoulder-frame-6w",
          program_version: 1,
          title_snapshot: "상체의 틀을 넓히는 6주",
          level_at_start: "beginner",
          start_date: "2026-08-14",
          timezone: "Asia/Seoul",
          preferred_slots: consecutiveSlots,
          status: "active",
        },
      ],
      error: null,
    });

    const rows = await getActiveProgramEnrollments("user-1");
    expect(rows[0].preferredSlots).toEqual(consecutiveSlots);
  });

  it("같은 요일 3개는 여전히 거부한다 — 주 3회가 아니다", () => {
    const duplicated = [
      { weekday: 5 as const, time: "19:00" },
      { weekday: 5 as const, time: "20:00" },
      { weekday: 6 as const, time: "19:00" },
    ];
    expect(() =>
      buildCreateProgramEnrollmentRpcArgs({
        ...consecutiveInput(),
        preferredSlots: duplicated,
      }),
    ).toThrow("program_invalid_slots");
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

  it("create RPC가 UUID가 아닌 성공값을 주면 거부한다", async () => {
    mocks.rpc.mockResolvedValue({ data: "not-a-uuid", error: null });
    await expect(createProgramEnrollment(createInput("beginner"))).rejects.toThrow(
      "program_invalid_enrollment_id",
    );
  });

  it("본인 active enrollment만 시작일 순으로 조회하고 정상 행을 복원한다", async () => {
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
    const query = queryReturning({ data: [valid], error: null });

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

  it("조회 결과에 잘못된 행이 하나라도 있으면 전체를 fail-closed 거부한다", async () => {
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
    queryReturning({
      data: [valid, { ...valid, preferred_slots: [{ weekday: 1, time: "oops" }] }],
      error: null,
    });

    await expect(getActiveProgramEnrollments("user-1")).rejects.toThrow(
      "program_invalid_enrollment_row",
    );
  });

  it("조회 오류를 그대로 던진다", async () => {
    const error = { message: "permission denied", code: "42501" };
    queryReturning({ data: null, error });
    await expect(getActiveProgramEnrollments("user-1")).rejects.toBe(error);
  });

  it("그만두기는 RPC에 등록 id를 넘기고 지운 계획 수를 돌려준다", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    mocks.rpc.mockResolvedValue({ data: 18, error: null });

    await expect(cancelProgramEnrollment(id)).resolves.toBe(18);
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_program_enrollment", {
      p_enrollment_id: id,
    });
  });

  it("그만두기 오류를 그대로 던지고, 이상한 성공값은 거부한다", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const error = { message: "program_not_active", code: "P0001" };
    mocks.rpc.mockResolvedValueOnce({ data: null, error });
    await expect(cancelProgramEnrollment(id)).rejects.toBe(error);

    mocks.rpc.mockResolvedValueOnce({ data: "18", error: null });
    await expect(cancelProgramEnrollment(id)).rejects.toThrow(
      "program_invalid_cancel_result",
    );
  });

  it("UUID가 아닌 id는 서버에 보내지 않는다", async () => {
    await expect(cancelProgramEnrollment("not-a-uuid")).rejects.toThrow(
      "program_invalid_enrollment_id",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
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
