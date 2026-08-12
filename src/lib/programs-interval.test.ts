import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogExercise } from "@/lib/types";
import {
  INTERVAL_PROGRAM,
  resolveIntervalProgram,
  type ProgramLevel,
} from "@/lib/domain/official-programs";
import { buildProgramSchedule } from "@/lib/domain/program-schedule";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import {
  buildCreateIntervalEnrollmentRpcArgs,
  createIntervalProgramEnrollment,
} from "./programs";

const slots = [
  { weekday: 1 as const, time: "19:00" },
  { weekday: 3 as const, time: "19:00" },
  { weekday: 5 as const, time: "18:00" },
];

const NAMES = [
  "니 푸시업", "데드버그", "라잉 Y 레이즈", "러시안 트위스트", "런지",
  "레그 레이즈", "리버스 런지", "마운틴 클라이머", "맨몸 스쿼트",
  "바이시클 크런치", "버드독", "버피", "브이 업", "사이드 런지",
  "슈퍼맨 로우", "와이드 스쿼트", "와이드 푸시업", "인치웜 푸시업",
  "점프 스쿼트", "점핑잭", "타이슨 푸시업", "파이크 푸시업", "푸시업",
  "플러터 킥", "피스톨 스쿼트", "하이 니",
];

function catalog(): CatalogExercise[] {
  return NAMES.map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name,
    body_part: "코어",
    exercise_type: "bodyweight",
    measure: null,
    is_custom: false,
    created_by: null,
    created_at: "2026-08-12T00:00:00.000Z",
  }));
}

function createInput(levelAtStart: ProgramLevel = "beginner") {
  return {
    program: INTERVAL_PROGRAM,
    sessions: resolveIntervalProgram(INTERVAL_PROGRAM, levelAtStart, catalog()),
    schedule: buildProgramSchedule({
      startDate: "2026-08-17",
      slots,
      timeZone: "Asia/Seoul",
      occupiedDates: new Set<string>(),
    }).plans,
    levelAtStart,
    startDate: "2026-08-17",
    timeZone: "Asia/Seoul",
    preferredSlots: slots,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("buildCreateIntervalEnrollmentRpcArgs", () => {
  it("18회를 만들고 난이도를 그대로 싣는다", () => {
    const args = buildCreateIntervalEnrollmentRpcArgs(createInput("moderate"));

    expect(args.p_program_key).toBe("interval-burn-6w");
    expect(args.p_level_at_start).toBe("moderate");
    expect(args.p_plans).toHaveLength(18);
  });

  /** 회차 길이는 사용자가 아니라 **주차**가 정한다 (설계 §3.4) */
  it("주차가 회차 길이를 올린다", () => {
    const args = buildCreateIntervalEnrollmentRpcArgs(createInput("beginner"));
    const minutesByWeek = args.p_plans.map((plan) => [
      plan.week,
      plan.tabata_minutes,
    ]);

    // 입문: 1~2주 4분 → 3주부터 8분. 16분은 없다
    expect(minutesByWeek.slice(0, 3)).toEqual([
      [1, 4],
      [1, 4],
      [1, 4],
    ]);
    expect(minutesByWeek.slice(6, 9)).toEqual([
      [3, 8],
      [3, 8],
      [3, 8],
    ]);
    expect(args.p_plans.map((plan) => plan.tabata_minutes)).not.toContain(16);
  });

  it("높음은 1주차부터 8분, 3주차부터 16분이다", () => {
    const args = buildCreateIntervalEnrollmentRpcArgs(
      createInput("experienced"),
    );
    expect(args.p_plans[0].tabata_minutes).toBe(8);
    expect(args.p_plans[6].tabata_minutes).toBe(16);
    expect(args.p_plans[17].tabata_minutes).toBe(16);
  });

  it("회차마다 종목 4개 · 각 세트 1개 · 처방 없음이다", () => {
    // 0070이 인터벌 회차를 이 모양으로 받는다. 처방을 실으면 근력 검증에 걸린다.
    const args = buildCreateIntervalEnrollmentRpcArgs(createInput("beginner"));

    for (const plan of args.p_plans) {
      expect(plan.exercises).toHaveLength(4);
      for (const exercise of plan.exercises) {
        expect(exercise.sets).toHaveLength(1);
        expect(exercise.prescription).toBeUndefined();
        expect("prescription" in exercise).toBe(false);
        expect(exercise.isCustom).toBe(false);
      }
    }
  });

  it("고른 난이도의 종목을 담는다", () => {
    const args = buildCreateIntervalEnrollmentRpcArgs(
      createInput("experienced"),
    );
    expect(args.p_plans[0].exercises.map((e) => e.name)).toEqual([
      "점프 스쿼트",
      "와이드 푸시업",
      "브이 업",
      "버피",
    ]);
  });

  it("A·B·C가 6주 동안 순서대로 돈다", () => {
    const args = buildCreateIntervalEnrollmentRpcArgs(createInput());
    expect(args.p_plans.map((plan) => plan.template_key).slice(0, 6)).toEqual([
      "A", "B", "C", "A", "B", "C",
    ]);
  });

  it("난이도와 다른 종목이 담겨 오면 거부한다", () => {
    // 화면이 난이도를 바꾸고 회차를 다시 합치지 않으면 여기서 걸린다
    const input = createInput("beginner");
    expect(() =>
      buildCreateIntervalEnrollmentRpcArgs({
        ...input,
        levelAtStart: "experienced",
      }),
    ).toThrow(/program_template_mismatch/);
  });

  it("종목 수가 4개가 아니면 거부한다", () => {
    const input = createInput();
    const short = input.sessions.map((session, index) =>
      index === 0
        ? { ...session, exercises: session.exercises.slice(0, 3) }
        : session,
    );
    expect(() =>
      buildCreateIntervalEnrollmentRpcArgs({ ...input, sessions: short }),
    ).toThrow("program_template_mismatch:A");
  });

  it("사용자가 만든 종목은 거부한다", () => {
    const input = createInput();
    const tainted = input.sessions.map((session, index) =>
      index === 0
        ? {
            ...session,
            exercises: session.exercises.map((exercise, position) =>
              position === 0
                ? { ...exercise, item: { ...exercise.item, is_custom: true } }
                : exercise,
            ),
          }
        : session,
    );
    expect(() =>
      buildCreateIntervalEnrollmentRpcArgs({ ...input, sessions: tainted }),
    ).toThrow(/program_catalog_item_invalid/);
  });

  it("날짜 규칙은 근력과 똑같이 지킨다", () => {
    const input = createInput();
    const duplicate = structuredClone(input.schedule);
    duplicate[1].date = duplicate[0].date;
    expect(() =>
      buildCreateIntervalEnrollmentRpcArgs({ ...input, schedule: duplicate }),
    ).toThrow(/program_plan_date_duplicate/);

    expect(() =>
      buildCreateIntervalEnrollmentRpcArgs({
        ...input,
        preferredSlots: input.preferredSlots.slice(0, 2),
      }),
    ).toThrow("program_slots_count");
  });

  it("입력을 바꾸지 않는다", () => {
    const input = createInput();
    const before = structuredClone(input);
    buildCreateIntervalEnrollmentRpcArgs(input);
    expect(input).toEqual(before);
  });
});

describe("createIntervalProgramEnrollment", () => {
  it("같은 RPC에 인터벌 payload를 넘긴다", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    mocks.rpc.mockResolvedValue({ data: id, error: null });
    const input = createInput("moderate");

    await expect(createIntervalProgramEnrollment(input)).resolves.toBe(id);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_program_enrollment",
      buildCreateIntervalEnrollmentRpcArgs(input),
    );
  });

  it("서버 오류 객체를 그대로 던진다", async () => {
    // 0070을 아직 Run하지 않았으면 여기로 온다 — 문구를 삼키면 원인을 모른다
    const error = { message: "program_invalid_exercises", code: "P0001" };
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(createIntervalProgramEnrollment(createInput())).rejects.toBe(
      error,
    );
  });
});
