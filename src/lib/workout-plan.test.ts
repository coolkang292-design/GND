import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ from: mocks.from }),
}));

import { getWorkoutPlans } from "./workout-plan";

function queryReturning(rows: unknown[]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockResolvedValue({ data: rows, error: null });
  mocks.from.mockReturnValue(query);
}

const exercise = {
  name: "벤치프레스",
  bodyPart: "가슴",
  exerciseType: "weight",
  measure: null,
  isCustom: false,
  sets: [{ weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0 }],
};

const baseRow = {
  id: "plan-1",
  user_id: "user-1",
  plan_date: "2026-08-17",
  source_session_id: null,
  exercises: [exercise],
  tabata_minutes: null,
  created_at: "2026-08-12T00:00:00.000Z",
  updated_at: "2026-08-12T00:00:00.000Z",
};

beforeEach(() => vi.clearAllMocks());

describe("WorkoutPlan 프로그램 메타데이터 복원", () => {
  it("0066 이전 legacy 행은 신규 필드를 null로 복원한다", async () => {
    queryReturning([baseRow]);
    const [plan] = await getWorkoutPlans("user-1");
    expect(plan).toMatchObject({
      title: null,
      scheduledAt: null,
      programEnrollmentId: null,
      programWeek: null,
      programSession: null,
      programTemplateVersion: null,
    });
  });

  it("프로그램 행의 제목·예약시각·연결·주차·회차·버전을 복원한다", async () => {
    queryReturning([
      {
        ...baseRow,
        title: "상체의 틀을 넓히는 6주 · 밀고 세우기",
        scheduled_at: "2026-08-17T10:00:00.000Z",
        program_enrollment_id: "11111111-1111-4111-8111-111111111111",
        program_week: 1,
        program_session: 1,
        program_template_version: 1,
      },
    ]);
    const [plan] = await getWorkoutPlans("user-1");
    expect(plan).toMatchObject({
      title: "상체의 틀을 넓히는 6주 · 밀고 세우기",
      scheduledAt: "2026-08-17T10:00:00.000Z",
      programEnrollmentId: "11111111-1111-4111-8111-111111111111",
      programWeek: 1,
      programSession: 1,
      programTemplateVersion: 1,
    });
  });

  it("범위를 벗어나거나 깨진 메타데이터는 null로 닫는다", async () => {
    queryReturning([
      {
        ...baseRow,
        title: " ",
        scheduled_at: "not-a-date",
        program_enrollment_id: null,
        program_week: 7,
        program_session: 0,
        program_template_version: 0,
      },
    ]);
    const [plan] = await getWorkoutPlans("user-1");
    expect(plan).toMatchObject({
      title: null,
      scheduledAt: null,
      programEnrollmentId: null,
      programWeek: null,
      programSession: null,
      programTemplateVersion: null,
    });
  });

  it("enrollment 연결이 있는데 필수 메타가 하나라도 깨지면 계획 전체를 거부한다", async () => {
    queryReturning([
      {
        ...baseRow,
        title: "상체의 틀을 넓히는 6주",
        scheduled_at: "not-a-date",
        program_enrollment_id: "11111111-1111-4111-8111-111111111111",
        program_week: 1,
        program_session: 1,
        program_template_version: 1,
      },
    ]);

    await expect(getWorkoutPlans("user-1")).rejects.toThrow(
      "invalid_workout_plan_program_metadata",
    );
  });

  it("FK 삭제로 연결만 null인 과거 스냅샷은 나머지 메타를 보존한다", async () => {
    queryReturning([
      {
        ...baseRow,
        title: "상체의 틀을 넓히는 6주",
        scheduled_at: "2026-08-17T10:00:00.000Z",
        program_enrollment_id: null,
        program_week: 1,
        program_session: 1,
        program_template_version: 1,
      },
    ]);

    const [plan] = await getWorkoutPlans("user-1");
    expect(plan).toMatchObject({
      programEnrollmentId: null,
      title: "상체의 틀을 넓히는 6주",
      scheduledAt: "2026-08-17T10:00:00.000Z",
      programWeek: 1,
      programSession: 1,
      programTemplateVersion: 1,
    });
  });
});
