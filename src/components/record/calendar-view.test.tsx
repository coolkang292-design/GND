// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
