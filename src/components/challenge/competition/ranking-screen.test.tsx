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
        { userId: "p1", rank: 1, achievement: 80, participation: 50, overall: 74.1, completedGoalCount: 0, workoutDays: 5, plannedDays: 10 },
        { userId: "me", rank: 2, achievement: 60, participation: 50, overall: 58.0, completedGoalCount: 0, workoutDays: 5, plannedDays: 10 },
      ],
    });
    expect(screen.getByRole("tab", { name: /종합 점수/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("74.1점")).toBeTruthy();
  });

  describe("종합 점수 줄을 누르면 점수 풀이가 펼쳐진다 (2026-11-20)", () => {
    const overallRanked = [
      { userId: "p1", rank: 1, achievement: 100, participation: 50, overall: 93, completedGoalCount: 1, workoutDays: 5, plannedDays: 10 },
      { userId: "me", rank: 2, achievement: 60, participation: 50, overall: 58, completedGoalCount: 0, workoutDays: 5, plannedDays: 10 },
    ];
    const open = () =>
      setup([session("me", 1)], 2, { initial: "overall", overallRanked });

    it("처음엔 접혀 있다 (부정 확인)", () => {
      open();
      expect(screen.queryByTestId("score-detail")).toBeNull();
    });

    it("내 줄을 누르면 목표·참여·보너스 점수와 합계가 보인다", () => {
      open();
      fireEvent.click(screen.getByRole("button", { name: "나 점수 계산 보기" }));
      const d = screen.getByTestId("score-detail");
      expect(d.textContent).toContain("48.0점"); // 60 × 0.8
      expect(d.textContent).toContain("10.0점"); // 50 × 0.2
      expect(d.textContent).toContain("+0점");
      expect(d.textContent).toContain("58.0점");
      // 다시 누르면 접힌다
      fireEvent.click(screen.getByRole("button", { name: "나 점수 계산 접기" }));
      expect(screen.queryByTestId("score-detail")).toBeNull();
    });

    it("다른 참가자도 같은 방식 — 목표 100%면 '더 안 올라요'가 붙는다", () => {
      open();
      fireEvent.click(screen.getByRole("button", { name: "참가자1 점수 계산 보기" }));
      const d = screen.getByTestId("score-detail");
      expect(d.textContent).toContain("80.0점"); // 100 × 0.8
      expect(d.textContent).toContain("+3점");
      expect(screen.getAllByTestId("cap-reached")).toHaveLength(1); // 목표점수만 (참여 50%, 보너스 1개)
    });

    it("계획보다 많이 운동해도 실제 일수를 말한다 — 17일 ÷ 계획 13일 → 100%(상한) (부정 확인: '13일 ÷ 13일'이 아니다)", () => {
      setup([session("me", 1)], 2, {
        initial: "overall",
        overallRanked: [
          { userId: "me", rank: 1, achievement: 50, participation: 100, overall: 60, completedGoalCount: 0, workoutDays: 17, plannedDays: 13 },
          { userId: "p1", rank: 2, achievement: 40, participation: 100, overall: 52, completedGoalCount: 0, workoutDays: 13, plannedDays: 13 },
        ],
      });
      fireEvent.click(screen.getByRole("button", { name: "나 점수 계산 보기" }));
      const d = screen.getByTestId("score-detail").textContent ?? "";
      expect(d).toContain("운동한 날 17일 ÷ 계획 13일 → 100%(상한)");
      expect(d).toContain("20.0점");
      expect(d).not.toContain("13일 ÷ 계획 13일");
    });

    it("종목 탭(운동 시간 등)의 줄은 눌러도 펼쳐지지 않는다 — 점수가 아니라서", () => {
      setup([session("me", 1)], 2);
      expect(screen.queryByRole("button", { name: /점수 계산/ })).toBeNull();
    });
  });

  it("같은 지표 목표가 있으면 하루 페이스 점선", () => {
    setup([session("me", 2, 30, 3), session("p1", 2, 30, 1)], 2, {
      initial: "cardioKm",
      myGoals: [{ goal_type: "cardio_distance", target_value: 30 }],
    });
    expect(screen.getByText("하루 목표 1km")).toBeTruthy();
  });
});
