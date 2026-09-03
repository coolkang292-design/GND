import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ from: mocks.from }),
}));

import { getWorkoutPlans } from "./workout-plan";

/**
 * PostgREST 쿼리 빌더 흉내.
 *
 * ⚠️ `order`가 **결과를 주지 않고 자기 자신을 준다.** 실제 빌더가 그렇고,
 *    `getWorkoutPlans`는 정렬을 세 번 건다(날짜 → 예정 시각 → 만든 순서,
 *    0101). 예전 mock은 첫 `order`에서 바로 결과를 뱉어서 두 번째 `order`가
 *    "함수가 아니다"로 죽었다. 결과는 **await할 때** 준다.
 */
function queryReturning(rows: unknown[]) {
  const result = { data: rows, error: null };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
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
  /*
    사다리 24회차는 3개씩 8묶음이라 **7·8주차**가 나온다 (2026-09-04).

    ⚠️ 이 파서가 1~6으로 막고 있으면 그 행 하나 때문에
       `invalid_workout_plan_program_metadata`가 나고 **달력 전체가 안 뜬다** —
       계획 한 줄이 아니라 화면이 통째로 죽는다. DB(0101)의 `program_week`
       check와 같은 범위여야 한다.
  */
  it("사다리의 7·8주차 회차를 읽는다", async () => {
    for (const week of [7, 8]) {
      queryReturning([
        {
          ...baseRow,
          title: `풀업 사다리 ${week * 3}일차 · 8·7·6·5·4`,
          scheduled_at: "2026-09-16T22:00:00.000Z",
          program_enrollment_id: "aa11bb22-cc33-4d44-8e55-ff6677889900",
          program_week: week,
          program_session: 1,
          program_template_version: 1,
        },
      ]);
      const [plan] = await getWorkoutPlans("user-1");
      expect(plan.programWeek).toBe(week);
    }
  });

  it("9주차는 여전히 거부한다 — 상한을 무한정 열지 않았다", async () => {
    queryReturning([
      {
        ...baseRow,
        title: "말이 안 되는 회차",
        scheduled_at: "2026-09-16T22:00:00.000Z",
        program_enrollment_id: "aa11bb22-cc33-4d44-8e55-ff6677889900",
        program_week: 9,
        program_session: 1,
        program_template_version: 1,
      },
    ]);
    await expect(getWorkoutPlans("user-1")).rejects.toThrow(
      "invalid_workout_plan_program_metadata",
    );
  });

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
        // 7·8주차는 사다리에서 **정상**이 됐다 (2026-09-04) — 범위 밖 예시를
        // 9로 옮긴다. 7을 두면 "범위 밖"을 검사하지 않는 테스트가 된다
        program_week: 9,
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
