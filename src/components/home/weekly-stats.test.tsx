// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyStats } from "./weekly-stats";

/**
 * 기준 시각 — **2026-08-13(목) 21:00 KST**. 주 한가운데로 고정한다.
 *
 * ⚠️⚠️ **시계를 고정하지 않으면 이 파일은 매주 월요일에 깨진다.** 2026-08-17(월)에
 * 실제로 그랬다. 옛 헬퍼는 `new Date()`에서 하루씩 거꾸로 날짜를 만들면서
 * *"주 경계를 넘지 않도록"* 이라고 주석만 달아 놓고 **아무것도 막지 않았다.**
 * 월요일에 `thisWeek(2)`를 부르면 `[월, 일]`이 되는데 주는 월요일에 시작하므로
 * (`weekRange`) 일요일은 **지난 주**다. 이번 주 운동일이 2일이 아니라 1일이 되어
 * `50%`가 `25%`로 나왔다.
 *
 * 목요일로 고정하면 3일 전까지 거슬러도 같은 주(월~일) 안에 머문다.
 */
const NOW = new Date("2026-08-13T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

/**
 * 이번 주(월~일) 안에 드는 **서로 다른 날** n개.
 *
 * ⚠️ `setDate`가 아니라 `setUTCDate`다. 기준 시각을 UTC로 잡아 놨으므로 UTC 기준
 * 하루씩 빼야 매 항목이 같은 벽시계 시각(21:00 KST)에 놓인다 — 실행 기기의
 * 로컬 타임존이 결과를 흔들지 않는다.
 */
function thisWeek(n: number): Date[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(NOW);
    d.setUTCDate(d.getUTCDate() - i);
    return d;
  });
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
    const weekTile = screen.getByText("목표 정하기 ›").closest("a");
    expect(weekTile?.textContent).toContain("2일");
    expect(container.textContent).not.toMatch(/\/\s*\d/);
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  /**
   * ⚠️ 사용자 지시 2026-08-08 — *"이번주 목표 칸에 목표가 없으면 눌러서
   * 목표세팅하게 해줘"*. **`이번 주 운동` 칸 자체가 눌려야 한다.** 옆 칸만
   * 링크로 두면 지시를 안 지킨 것이다.
   */
  it("목표가 없으면 이번 주 운동 칸 자체가 눌린다", () => {
    render(<WeeklyStats completedAts={thisWeek(1)} weeklyGoal={null} />);
    const tile = screen.getByText("목표 정하기 ›").closest("a");
    expect(tile?.getAttribute("href")).toBe("/challenge");
    // 운동일 수와 같은 칸 안에 있어야 한다 — 별도 칸이면 지시와 다르다.
    expect(tile?.textContent).toContain("1일");
  });

  it("목표가 있으면 그 칸은 링크가 아니다", () => {
    const { container } = render(
      <WeeklyStats completedAts={thisWeek(1)} weeklyGoal={4} />,
    );
    expect(container.querySelectorAll("a").length).toBe(0);
  });

  it("칸은 늘 3개고 스트릭은 목표와 무관하다", () => {
    for (const goal of [3, null] as const) {
      cleanup();
      const { container } = render(
        <WeeklyStats completedAts={thisWeek(1)} weeklyGoal={goal} />,
      );
      expect(container.querySelector(".grid")?.children.length).toBe(3);
      expect(screen.getByText("스트릭")).toBeTruthy();
    }
  });
});
