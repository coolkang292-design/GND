// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MetricRow } from "@/lib/domain/challenge-metrics";
import { RankingScreen } from "./ranking-screen";

afterEach(cleanup);

const session = (userId: string, day: number, min = 30, km = 0): MetricRow => ({
  userId,
  completedAt: `2026-09-${String(day).padStart(2, "0")}T01:00:00Z`,
  durationMinutes: min,
  exercises: [
    { exerciseType: "cardio", sets: [{ weightKg: null, reps: null, distanceMeters: km * 1000, isCompleted: true }] },
  ],
});

const members = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i === 0 ? "me" : `p${i}`, nickname: i === 0 ? "나" : `참가자${i}`, avatar_url: null }));

function setup(rows: MetricRow[], n: number, extra: Partial<Parameters<typeof RankingScreen>[0]> = {}) {
  render(
    <RankingScreen
      rows={rows}
      members={members(n)}
      myUserId="me"
      startDate="2026-09-01"
      endDate="2026-09-30"
      endKey="2026-09-20"
      todayKey="2026-09-20"
      timeZone="Asia/Seoul"
      myGoals={[]}
      initial="minutes"
      overallRanked={null}
      onBack={() => {}}
      {...extra}
    />,
  );
}

describe("진행 중 챌린지 랭킹 화면", () => {
  it("운동 시간 2위 — 시안 문구·비교 카드·팁", () => {
    setup([session("me", 1, 509), session("p1", 1, 533), session("p2", 1, 412)], 3);
    expect(screen.getByText("운동 시간 랭킹")).toBeTruthy();
    expect(screen.getByTestId("gap-message").textContent).toContain("1위까지 -24분!");
    const cmp = screen.getByTestId("comparison");
    expect(cmp.textContent).toContain("1위와 비교");
    expect(cmp.textContent).toContain("509분");
    expect(cmp.textContent).toContain("533분");
    expect(cmp.textContent).toContain("-24분");
    expect(screen.getByText("24분만 더 하면 1위를 탈환할 수 있어요!")).toBeTruthy();
  });

  it("내 진행 현황 — 기간 일수만큼 막대, 이번 주로 줄인다", () => {
    setup([session("me", 3), session("me", 15), session("p1", 2)], 2);
    expect(screen.getAllByTestId("metric-day")).toHaveLength(20);
    fireEvent.change(screen.getByLabelText("기간"), { target: { value: "week" } });
    expect(screen.getAllByTestId("metric-day")).toHaveLength(6); // 9/15~9/20 (3주차)
  });

  it("30명 — 10줄 + 내 줄, 전체 보기로 30줄", () => {
    const rows = Array.from({ length: 30 }, (_, i) => session(i === 0 ? "me" : `p${i}`, 1, 100 - i));
    setup(rows.map((r, i) => (i === 0 ? { ...r, durationMinutes: 1 } : r)), 30);
    expect(screen.getAllByTestId("ranking-line")).toHaveLength(11);
    fireEvent.click(screen.getByRole("button", { name: /전체 30명 보기/ }));
    expect(screen.getAllByTestId("ranking-line")).toHaveLength(30);
  });

  it("종합 점수 탭은 live_ranking 방에만", () => {
    setup([session("me", 1)], 2);
    expect(screen.queryByRole("tab", { name: /종합 점수/ })).toBeNull();
    cleanup();
    setup([session("me", 1)], 2, {
      initial: "overall",
      overallRanked: [
        { userId: "p1", rank: 1, achievement: 80, participation: 50, overall: 74.1, completedGoalCount: 0 },
        { userId: "me", rank: 2, achievement: 60, participation: 50, overall: 58.0, completedGoalCount: 0 },
      ],
    });
    expect(screen.getByRole("tab", { name: /종합 점수/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("74.1점")).toBeTruthy();
  });

  it("같은 지표 목표가 있으면 하루 페이스 점선", () => {
    setup([session("me", 2, 30, 3), session("p1", 2, 30, 1)], 2, {
      initial: "cardioKm",
      myGoals: [{ goal_type: "cardio_distance", target_value: 30 }],
    });
    expect(screen.getByText("하루 목표 1km")).toBeTruthy();
  });
});
