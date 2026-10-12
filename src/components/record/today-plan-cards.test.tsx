// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutPlan } from "@/lib/workout-plan";
import { TodayPlanCards } from "./today-plan-cards";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(() => cleanup());

function plan(id: string, over: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id,
    userId: "u1",
    planDate: "2026-10-13",
    sourceSessionId: null,
    exercises: [
      {
        name: "풀업",
        bodyPart: "등",
        exerciseType: "bodyweight",
        measure: "reps",
        isCustom: false,
        sets: [{ weightKg: 0, reps: 5, distanceKm: 0, durationMin: 0 }],
      },
    ],
    tabataMinutes: null,
    title: null,
    scheduledAt: null,
    programEnrollmentId: null,
    programWeek: null,
    programSession: null,
    programTemplateVersion: null,
    createdAt: "c",
    updatedAt: "u",
    ...over,
  };
}

describe("TodayPlanCards", () => {
  it("인터벌과 프로그램 회차를 각각 카드로 그리고, 일반 계획은 그리지 않는다", () => {
    render(
      <TodayPlanCards
        plans={[
          plan("g"),
          plan("i", { tabataMinutes: 8 }),
          plan("p", { programEnrollmentId: "e1", title: "풀업 6주" }),
        ]}
        disabled={false}
        onStart={() => {}}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByTestId("today-interval-start")).toBeTruthy();
    expect(screen.getByText("풀업 6주")).toBeTruthy();
  });

  it("누르면 그 계획으로 시작을 부른다", () => {
    const onStart = vi.fn();
    const program = plan("p", { programEnrollmentId: "e1", title: "풀업 6주" });
    render(<TodayPlanCards plans={[program]} disabled={false} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onStart).toHaveBeenCalledWith(program);
  });

  it("특별 계획이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <TodayPlanCards plans={[plan("g")]} disabled={false} onStart={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
