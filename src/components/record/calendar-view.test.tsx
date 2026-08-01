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
