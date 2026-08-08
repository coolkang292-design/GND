// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WeeklyStats } from "./weekly-stats";

afterEach(cleanup);

/** 이번 주(월~일) 안에 드는 날 n개. 기준일을 고정해야 주 경계에 안 걸린다. */
function thisWeek(n: number): Date[] {
  const now = new Date();
  const out: Date[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    // 오늘부터 거꾸로 — 주 경계를 넘지 않도록 요일 수만큼만 부른다.
    d.setDate(now.getDate() - i);
    out.push(d);
  }
  return out;
}

describe("WeeklyStats — 주간 기준은 챌린지에서 온다 (2026-08-08)", () => {
  it("챌린지 목표가 있으면 분모와 달성률을 그린다", () => {
    render(<WeeklyStats completedAts={thisWeek(2)} weeklyGoal={4} />);
    expect(screen.getByText("/ 4")).toBeTruthy();
    expect(screen.getByText("목표 달성률")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("목표를 넘겨도 100%를 넘지 않는다", () => {
    render(<WeeklyStats completedAts={thisWeek(3)} weeklyGoal={1} />);
    expect(screen.getByText("100%")).toBeTruthy();
  });

  /**
   * ⚠️ 이 두 단언이 이 작업의 전부다. `weeklyGoal`에 기본값을 붙이면 둘 다 깨진다 —
   * 아무도 정하지 않은 분모로 달성률을 매기던 예전 상태로 돌아간 것이다.
   */
  it("챌린지가 없으면 분모를 그리지 않는다 (부정 확인)", () => {
    const { container } = render(
      <WeeklyStats completedAts={thisWeek(2)} weeklyGoal={null} />,
    );
    // ⚠️ `getByText("2일")`로 찾지 마라 — 스트릭 칸도 같은 글자를 그려서
    //    둘이 잡힌다. 칸을 특정해서 본다.
    const weekTile = screen.getByText("이번 주 운동").closest("div");
    expect(weekTile?.textContent).toContain("2일");
    expect(container.textContent).not.toMatch(/\/\s*\d/);
    expect(screen.queryByText("목표 달성률")).toBeNull();
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it("챌린지가 없으면 목표를 정하러 갈 문을 준다", () => {
    render(<WeeklyStats completedAts={thisWeek(1)} weeklyGoal={null} />);
    const link = screen.getByText("목표 정하기 ›").closest("a");
    expect(link?.getAttribute("href")).toBe("/challenge");
  });

  it("이번 주 운동일과 스트릭 칸은 목표와 무관하게 늘 있다", () => {
    for (const goal of [3, null] as const) {
      cleanup();
      render(<WeeklyStats completedAts={thisWeek(1)} weeklyGoal={goal} />);
      expect(screen.getByText("이번 주 운동")).toBeTruthy();
      expect(screen.getByText("스트릭")).toBeTruthy();
    }
  });
});
