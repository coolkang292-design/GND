// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProgramsPage from "./page";


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

  it("인터벌이 프로그램 목록에 선다", async () => {
    // 사용자 지시 2026-08-12 — 인터벌은 진입 버튼이 아니라 **공식 프로그램**이다
    render(<ProgramsPage />);
    await waitFor(() => {
      expect(screen.getByText("짧고 굵게 태우는 전신")).toBeTruthy();
    });
    expect(screen.getByText("기구 없이 4분부터 시작하는 6주")).toBeTruthy();
  });
});
