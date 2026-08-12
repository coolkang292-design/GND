// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProgramsPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    userId: "user-1",
    loading: false,
    configured: true,
    error: null,
  }),
}));

vi.mock("@/lib/workout", () => ({
  getExerciseCatalog: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/workout-plan", () => ({
  getWorkoutPlans: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/programs", () => ({
  getActiveProgramEnrollments: vi.fn().mockResolvedValue([]),
  createProgramEnrollment: vi.fn(),
}));

afterEach(cleanup);
beforeEach(() => {
  push.mockClear();
  sessionStorage.clear();
});

describe("ProgramsPage", () => {
  it("인증 사용자 기준으로 카탈로그·계획·등록 현황을 읽은 뒤 프로그램 흐름을 연다", async () => {
    render(<ProgramsPage />);

    expect(screen.getByText("프로그램을 불러오는 중…")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("목표를 고르면 6주 계획이 완성돼요")).toBeTruthy();
    });

    const { getExerciseCatalog } = await import("@/lib/workout");
    const { getWorkoutPlans } = await import("@/lib/workout-plan");
    const { getActiveProgramEnrollments } = await import("@/lib/programs");
    expect(getExerciseCatalog).toHaveBeenCalledTimes(1);
    expect(getWorkoutPlans).toHaveBeenCalledWith("user-1");
    expect(getActiveProgramEnrollments).toHaveBeenCalledWith("user-1");
  });

  /**
   * 사용자 지시 2026-08-12 — 전신 인터벌이 이 화면 안으로 들어왔다.
   * 인터벌 시트는 `/record`가 들고 있으므로 "열어라"만 남기고 그리로 보낸다.
   */
  it("인터벌 카드를 누르면 요청을 남기고 기록 화면으로 보낸다", async () => {
    render(<ProgramsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("interval-entry-card")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("interval-entry-card"));

    expect(sessionStorage.getItem("gnd-start-interval")).toBe("1");
    expect(push).toHaveBeenCalledWith("/record");
  });
});
