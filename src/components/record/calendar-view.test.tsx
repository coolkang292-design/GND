// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarView } from "./calendar-view";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  getCompletedSessions: vi.fn(),
  getSessionLogExercises: vi.fn(),
  getWorkoutPlans: vi.fn(),
  getActiveProgramEnrollments: vi.fn(),
  rescheduleProgramPlans: vi.fn(),
}));

vi.mock("@/lib/crew", () => ({ getMyProfile: mocks.getMyProfile }));
vi.mock("@/lib/workout", () => ({
  getCompletedSessions: mocks.getCompletedSessions,
  getSessionLogExercises: mocks.getSessionLogExercises,
}));
vi.mock("@/lib/workout-plan", () => ({
  getWorkoutPlans: mocks.getWorkoutPlans,
  saveWorkoutPlan: vi.fn(),
  moveWorkoutPlan: vi.fn(),
  deleteWorkoutPlan: vi.fn(),
}));
vi.mock("@/lib/programs", () => ({
  getActiveProgramEnrollments: mocks.getActiveProgramEnrollments,
  rescheduleProgramPlans: mocks.rescheduleProgramPlans,
}));

/** 월 경계에서 흔들리지 않게 달 한가운데로 고정한다 (KST 2026-08-15) */
const TODAY_KST = new Date("2026-08-15T12:00:00+09:00");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY_KST);
  mocks.getMyProfile.mockResolvedValue({
    timezone: "Asia/Seoul",
    weekly_goal: 3,
  });
  mocks.getCompletedSessions.mockResolvedValue([]);
  mocks.getWorkoutPlans.mockResolvedValue([]);
  mocks.getSessionLogExercises.mockResolvedValue([]);
  mocks.getActiveProgramEnrollments.mockResolvedValue([]);
  mocks.rescheduleProgramPlans.mockReset();
  mocks.rescheduleProgramPlans.mockResolvedValue(undefined);
});

async function setup() {
  const view = render(
    <CalendarView
      userId="user-1"
      catalog={[]}
      onScheduleSession={vi.fn()}
      onLoadPlan={vi.fn()}
      onCreateCustom={vi.fn()}
    />,
  );
  // useEffect의 3건 fetch가 끝나 달력이 그려질 때까지
  await screen.findByText("2026년 8월");
  return view;
}

describe("CalendarView — 날짜를 눌러 계획하기 (2026-08-02)", () => {
  it("미래의 빈 날짜 셀은 눌린다", async () => {
    // 이 단언이 그 버그 자체다. 전에는 disabled={!stamp && !plan}이라
    // 기록도 계획도 없는 미래 셀이 전부 잠겨 있어서, "새 운동 계획 만들기"에
    // 도달할 방법이 사실상 없었다. 다시 잠기면 여기서 실패한다.
    await setup();

    const tomorrow = screen.getByRole("button", { name: "8월 16일" });
    expect(tomorrow).not.toHaveProperty("disabled", true);
    expect((tomorrow as HTMLButtonElement).disabled).toBe(false);
  });

  it("오늘의 빈 날짜 셀도 눌린다", async () => {
    await setup();
    const today = screen.getByRole("button", {
      name: "8월 15일",
    }) as HTMLButtonElement;
    expect(today.disabled).toBe(false);
  });

  it("과거의 빈 날짜 셀은 잠긴다", async () => {
    // 반대 방향 단언 — 전부 열어 버리는 과잉 수정을 막는다.
    // 지난 날은 기록도 없고 0015 RLS상 계획도 세울 수 없다.
    await setup();
    const yesterday = screen.getByRole("button", {
      name: "8월 14일",
    }) as HTMLButtonElement;
    expect(yesterday.disabled).toBe(true);
  });

  it("미래의 빈 날짜를 누르면 계획 만들기 버튼이 있는 시트가 열린다", async () => {
    await setup();

    expect(screen.queryByText("➕ 새 운동 계획 만들기")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByText("➕ 새 운동 계획 만들기")).toBeTruthy();
    expect(
      screen.getByText(/아직 이 날의 계획이 없어요/),
    ).toBeTruthy();
  });
});

/**
 * ⑥ 계획한 운동의 상세보기 (2026-08-04).
 *
 * 계획의 세트·수량은 `workout_plans.exercises` jsonb에 **이미 들어 있고**
 * 시트가 그걸 이미 손에 쥐고 있다. 전에는 종목명만 join해 그렸다.
 */
const PLAN = {
  id: "plan-1",
  userId: "user-1",
  planDate: "2026-08-16",
  sourceSessionId: null,
  createdAt: "2026-08-15T00:00:00Z",
  updatedAt: "2026-08-15T00:00:00Z",
  exercises: [
    {
      name: "스쿼트",
      bodyPart: "하체" as const,
      exerciseType: "weight" as const,
      measure: null,
      isCustom: false,
      sets: [
        { weightKg: 80, reps: 5, distanceKm: 0, durationMin: 0 },
        { weightKg: 80, reps: 3, distanceKm: 0, durationMin: 0 },
      ],
    },
    {
      name: "러닝",
      bodyPart: "유산소" as const,
      exerciseType: "cardio" as const,
      measure: null,
      isCustom: false,
      sets: [{ weightKg: 0, reps: 0, distanceKm: 3, durationMin: 25 }],
    },
  ],
};

/**
 * ④ 지난 운동 기록 상세보기 — 달력 경로 (2026-08-04).
 *
 * 시트는 공유 텍스트용으로 `getSessionLogExercises`를 **이미 호출한다**.
 * 세션별로 나눠 보관해 그리기만 하면 된다 — 새 조회가 없다.
 */
const SESSION = {
  id: "session-1",
  completedAt: new Date("2026-08-10T19:00:00+09:00"),
  verification: "camera_verified" as const,
  durationSeconds: 3600,
  exerciseNames: ["벤치 프레스"],
  recordNote: null,
  tabataMinutes: null,
};

const SESSION_LOG = [
  {
    name: "벤치 프레스",
    exerciseType: "weight" as const,
    measure: null,
    sets: [
      { weightKg: 60, reps: 8, distanceKm: 0, durationMin: 0, done: true },
      { weightKg: 60, reps: 4, distanceKm: 0, durationMin: 0, done: false },
    ],
  },
];

describe("CalendarView — 지난 기록 상세 (2026-08-04)", () => {
  beforeEach(() => {
    mocks.getCompletedSessions.mockResolvedValue([SESSION]);
    mocks.getSessionLogExercises.mockResolvedValue(SESSION_LOG);
  });

  async function openDay() {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));
  }

  it("펼치기 전에는 세트가 보이지 않는다", async () => {
    await openDay();

    expect(screen.queryByText("60kg 8회")).toBeNull();
  });

  it("세션 줄을 누르면 그 운동의 세트가 펼쳐진다", async () => {
    await openDay();

    fireEvent.click(await screen.findByRole("button", { name: /운동 상세/ }));

    expect(screen.getByText("60kg 8회")).toBeTruthy();
    expect(screen.getByText("60kg 4회")).toBeTruthy();
  });

  it("완료 세트와 미완료 세트를 구분해 보여준다 — done이 실제로 전달돼야 한다", async () => {
    await openDay();

    fireEvent.click(await screen.findByRole("button", { name: /운동 상세/ }));

    expect(screen.getByLabelText("1세트 완료")).toBeTruthy();
    expect(screen.getByLabelText("2세트 미완료")).toBeTruthy();
  });

  it("다시 누르면 접힌다", async () => {
    await openDay();

    const row = await screen.findByRole("button", { name: /운동 상세/ });
    fireEvent.click(row);
    expect(screen.getByText("60kg 8회")).toBeTruthy();

    fireEvent.click(row);
    expect(screen.queryByText("60kg 8회")).toBeNull();
  });

  it("복사 버튼은 그대로 남는다 — 상세는 더하는 것이지 뺏는 게 아니다", async () => {
    await openDay();

    expect(screen.getByText("📋 복사")).toBeTruthy();
  });
});

describe("CalendarView — 계획 상세 (2026-08-04)", () => {
  it("계획을 누르면 종목별 세트 수량까지 보여준다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByText("80kg 5회")).toBeTruthy();
    expect(screen.getByText("80kg 3회")).toBeTruthy();
    expect(screen.getByText("3km 25분")).toBeTruthy();
  });

  it("계획에는 완료·미완료 표시를 그리지 않는다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.queryByLabelText(/세트 완료$/)).toBeNull();
    expect(screen.queryByLabelText(/세트 미완료$/)).toBeNull();
  });

  it("종목 요약 줄은 그대로 남는다 — 상세는 더하는 것이지 바꾸는 게 아니다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByText("스쿼트 · 러닝")).toBeTruthy();
    expect(screen.getByText(/2종목/)).toBeTruthy();
  });
});

/**
 * 명칭 통일 (2026-08-12, 사용자 지시) — 화면에서는 "타바타"라는 전문용어를
 * 쓰지 않고 "전신 인터벌"로 부른다. 예정 배지·준비 버튼·지난 기록 줄이
 * 같은 말을 해야 한다. 내부 필드명(`tabataMinutes`)은 그대로다.
 */
const INTERVAL_PLAN = {
  ...PLAN,
  id: "plan-interval",
  planDate: "2026-08-15",
  tabataMinutes: 8,
};

const INTERVAL_SESSION = {
  ...SESSION,
  id: "session-interval",
  tabataMinutes: 8,
};

describe("CalendarView — 전신 인터벌 명칭 (2026-08-12)", () => {
  it("오늘의 인터벌 계획은 예정 배지와 준비 버튼을 전신 인터벌로 안내한다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([INTERVAL_PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 15일" }));

    expect(screen.getByText("🔥 전신 인터벌 8분 예정")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "🔥 전신 인터벌 준비하기" }),
    ).toBeTruthy();
  });

  it("지난 인터벌 기록 줄도 전신 인터벌로 적는다", async () => {
    mocks.getCompletedSessions.mockResolvedValue([INTERVAL_SESSION]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));

    expect(screen.getByText(/전신 인터벌 8분/)).toBeTruthy();
  });

  it("옛 용어 '타바타'는 계획에도 기록에도 남지 않는다", async () => {
    // 제거 검증 — 새 문구가 있는지만 보면 옛 문구가 사라졌는지 확인한 게 아니다.
    mocks.getWorkoutPlans.mockResolvedValue([INTERVAL_PLAN]);
    mocks.getCompletedSessions.mockResolvedValue([INTERVAL_SESSION]);
    const { container } = await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 15일" }));
    expect(container.textContent ?? "").not.toContain("타바타");

    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));
    expect(container.textContent ?? "").not.toContain("타바타");
  });
});

/**
 * 프로그램 진행 표시와 결석 재배치 (계획 2026-08-12 Task 7).
 *
 * 데이터·도메인은 이미 있다 — `WorkoutPlan`이 프로그램 메타를 싣고 오고,
 * `buildMissedSessionProposal()`은 순수 함수이며 `rescheduleProgramPlans()`가
 * RPC를 감싼다. 여기서 고정하는 것은 **화면 배선**이다.
 *
 * ⚠️ 제안만 만들었을 때 DB를 건드리면 안 된다. 사용자가 확인을 누르기 전에
 *    RPC가 나가면 "미리보기"가 아니라 그냥 실행이다.
 */
const ENROLLMENT = {
  id: "11111111-1111-4111-8111-111111111111",
  programKey: "shoulder-frame-6w",
  programVersion: 1,
  title: "상체의 틀을 넓히는 6주",
  levelAtStart: "beginner" as const,
  startDate: "2026-08-10",
  timeZone: "Asia/Seoul",
  // 월·수·금 19시 — 2026-08-10/12/14가 여기 걸린다
  preferredSlots: [
    { weekday: 1 as const, time: "19:00" },
    { weekday: 3 as const, time: "19:00" },
    { weekday: 5 as const, time: "19:00" },
  ],
  status: "active" as const,
};

function programPlan(overrides: {
  id: string;
  planDate: string;
  programWeek: number;
  programSession: number;
}) {
  return {
    userId: "user-1",
    sourceSessionId: null,
    exercises: [
      {
        name: "숄더프레스",
        bodyPart: "어깨" as const,
        exerciseType: "weight" as const,
        measure: null,
        isCustom: false,
        sets: [{ weightKg: 0, reps: 8, distanceKm: 0, durationMin: 0 }],
      },
    ],
    tabataMinutes: null,
    title: ENROLLMENT.title,
    scheduledAt: `${overrides.planDate}T10:00:00.000Z`,
    programEnrollmentId: ENROLLMENT.id,
    programTemplateVersion: 1,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("CalendarView — 프로그램 진행 표시 (2026-08-12)", () => {
  beforeEach(() => {
    mocks.getActiveProgramEnrollments.mockResolvedValue([ENROLLMENT]);
  });

  it("프로그램 계획에 프로그램명과 주차·회차 기호를 보여준다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222222",
        planDate: "2026-08-24",
        programWeek: 2,
        programSession: 1,
      }),
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 24일" }));

    expect(screen.getByText("상체의 틀을 넓히는 6주")).toBeTruthy();
    expect(screen.getByText("2주차 · A")).toBeTruthy();
  });

  it("회차 번호를 A·B·C로 옮긴다 — 3회차는 C다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222223",
        planDate: "2026-08-24",
        programWeek: 6,
        programSession: 3,
      }),
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 24일" }));

    expect(screen.getByText("6주차 · C")).toBeTruthy();
  });

  it("프로그램 계획은 일반 계획과 구분된다 — 운동 예정으로 뭉뚱그리지 않는다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222222",
        planDate: "2026-08-24",
        programWeek: 2,
        programSession: 1,
      }),
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 24일" }));

    expect(screen.queryByText("운동 예정")).toBeNull();
    expect(screen.getByText(/프로그램 예정/)).toBeTruthy();
  });

  it("일반 계획은 예전 그대로 운동 예정이다 — 회귀", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByText("운동 예정")).toBeTruthy();
    expect(screen.queryByText(/프로그램 예정/)).toBeNull();
  });

  it("지난 미완료 회차에 놓친 운동을 표시한다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222224",
        planDate: "2026-08-10",
        programWeek: 1,
        programSession: 1,
      }),
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));

    expect(screen.getByText("놓친 운동")).toBeTruthy();
  });

  it("그날 운동을 마쳤으면 놓친 운동이 아니다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222225",
        planDate: "2026-08-10",
        programWeek: 1,
        programSession: 1,
      }),
    ]);
    mocks.getCompletedSessions.mockResolvedValue([
      {
        ...SESSION,
        id: "done-1",
        completedAt: new Date("2026-08-10T19:00:00+09:00"),
      },
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));

    expect(screen.queryByText("놓친 운동")).toBeNull();
  });

  it("아직 오지 않은 회차는 놓친 운동이 아니다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([
      programPlan({
        id: "22222222-2222-4222-8222-222222222226",
        planDate: "2026-08-24",
        programWeek: 2,
        programSession: 1,
      }),
    ]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 24일" }));

    expect(screen.queryByText("놓친 운동")).toBeNull();
  });
});

describe("CalendarView — 남은 일정 재배치 (2026-08-12)", () => {
  /** 08-10 놓침 · 08-12 완료 · 08-17 예정 */
  const PLANS = [
    programPlan({
      id: "33333333-3333-4333-8333-333333333331",
      planDate: "2026-08-10",
      programWeek: 1,
      programSession: 1,
    }),
    programPlan({
      id: "33333333-3333-4333-8333-333333333332",
      planDate: "2026-08-12",
      programWeek: 1,
      programSession: 2,
    }),
    programPlan({
      id: "33333333-3333-4333-8333-333333333333",
      planDate: "2026-08-17",
      programWeek: 1,
      programSession: 3,
    }),
  ];

  beforeEach(() => {
    mocks.getActiveProgramEnrollments.mockResolvedValue([ENROLLMENT]);
    mocks.getWorkoutPlans.mockResolvedValue(PLANS);
    // 08-12은 실제로 운동을 마쳤다 → 이동 대상이 아니다
    mocks.getCompletedSessions.mockResolvedValue([
      {
        ...SESSION,
        id: "done-2",
        completedAt: new Date("2026-08-12T19:00:00+09:00"),
      },
    ]);
  });

  async function openMissed() {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "8월 10일" }));
  }

  it("프로그램 계획은 날짜 이동 대신 남은 일정 다시 잡기를 준다", async () => {
    await openMissed();

    expect(
      screen.getByRole("button", { name: "남은 일정 다시 잡기" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "날짜 이동" })).toBeNull();
  });

  it("아직 오지 않은 프로그램 회차에는 재배치 버튼을 보이지 않는다", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "8월 17일" }));

    expect(
      screen.queryByRole("button", { name: "남은 일정 다시 잡기" }),
    ).toBeNull();
  });

  it("일반 계획에는 날짜 이동이 그대로 남는다 — 회귀", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([PLAN]);
    mocks.getCompletedSessions.mockResolvedValue([]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: "8월 16일" }));

    expect(screen.getByRole("button", { name: "날짜 이동" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "남은 일정 다시 잡기" }),
    ).toBeNull();
  });

  it("제안을 눌러도 확인 전에는 DB를 바꾸지 않는다", async () => {
    await openMissed();

    fireEvent.click(screen.getByRole("button", { name: "남은 일정 다시 잡기" }));

    expect(await screen.findByText(/이렇게 옮길게요/)).toBeTruthy();
    expect(mocks.rescheduleProgramPlans).not.toHaveBeenCalled();
  });

  it("제안에 옮겨질 날짜가 보인다", async () => {
    await openMissed();

    fireEvent.click(screen.getByRole("button", { name: "남은 일정 다시 잡기" }));
    await screen.findByText(/이렇게 옮길게요/);

    // 놓친 08-10은 오늘(08-15) 이후로 밀린다
    expect(screen.getByText(/8월 10일 →/)).toBeTruthy();
  });

  it("확인하면 RPC를 정확히 한 번 부른다", async () => {
    await openMissed();

    fireEvent.click(screen.getByRole("button", { name: "남은 일정 다시 잡기" }));
    fireEvent.click(await screen.findByRole("button", { name: "이대로 옮기기" }));

    await waitFor(() =>
      expect(mocks.rescheduleProgramPlans).toHaveBeenCalledTimes(1),
    );
    const arg = mocks.rescheduleProgramPlans.mock.calls[0][0];
    expect(arg.enrollmentId).toBe(ENROLLMENT.id);
    expect(arg.moves.length).toBeGreaterThan(0);
  });

  it("이미 마친 회차는 이동 대상에 넣지 않는다", async () => {
    await openMissed();

    fireEvent.click(screen.getByRole("button", { name: "남은 일정 다시 잡기" }));
    fireEvent.click(await screen.findByRole("button", { name: "이대로 옮기기" }));

    await waitFor(() =>
      expect(mocks.rescheduleProgramPlans).toHaveBeenCalledTimes(1),
    );
    const { moves } = mocks.rescheduleProgramPlans.mock.calls[0][0];
    expect(
      (moves as { planId: string }[]).some((m) => m.planId === PLANS[1].id),
    ).toBe(false);
  });

  it("옮기는 날짜는 전부 오늘 이후다 — 과거로 되돌리지 않는다", async () => {
    await openMissed();

    fireEvent.click(screen.getByRole("button", { name: "남은 일정 다시 잡기" }));
    fireEvent.click(await screen.findByRole("button", { name: "이대로 옮기기" }));

    await waitFor(() =>
      expect(mocks.rescheduleProgramPlans).toHaveBeenCalledTimes(1),
    );
    const { moves } = mocks.rescheduleProgramPlans.mock.calls[0][0];
    for (const move of moves as { suggestedDate: string }[]) {
      expect(move.suggestedDate >= "2026-08-15").toBe(true);
    }
  });
});
