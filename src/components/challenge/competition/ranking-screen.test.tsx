// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MetricRow } from "@/lib/domain/challenge-metrics";
import { rankForChallenge } from "@/lib/domain/challenge-ranking";
import type { ParticipantInput } from "@/lib/domain/goal-score";
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

describe("종합 점수 줄을 누르면 목표 점수와 활동 점수가 따로 펼쳐진다 (진행 중 실시간 랭킹, 2026-11-20)", () => {
  const input = (userId: string, workoutDays: number, plannedDays: number, actual: number): ParticipantInput => ({
    userId,
    goals: [{ type: "workout_days", target: 10, actual }],
    workoutDays,
    plannedDays,
  });
  // 운동 횟수·시간은 세션 기록에서 온다: 나 3회 × 60분 = 180분, p1 2회 × 30분 = 60분
  const sessions = [session("me", 1, 60), session("me", 2, 60), session("me", 3, 60), session("p1", 1, 30), session("p1", 2, 30)];
  // 진행 중 화면과 같은 길 — includeActivity: false (활동 점수는 순위에 종료 후에만 더한다)
  const live = (inputs: ParticipantInput[]) =>
    rankForChallenge({
      scoringVersion: 2,
      includeActivity: false,
      inputs,
      rows: sessions,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      timeZone: "Asia/Seoul",
    });
  const open = () =>
    setup(sessions, 2, {
      initial: "overall",
      overallRanked: live([input("me", 17, 13, 6), input("p1", 3, 13, 9)]),
    });
  const text = (testId: string) => screen.getByTestId(testId).textContent ?? "";

  it("처음엔 모두 접혀 있다 (부정 확인)", () => {
    open();
    expect(screen.queryByTestId("live-score-detail")).toBeNull();
  });

  it("순위표의 점수는 기본 점수 그대로다 — 활동 점수가 섞여 숫자가 튀지 않는다 (68.0점, 91점이 아니다)", () => {
    open();
    expect(screen.getByText("68.0점")).toBeTruthy(); // 48 + 20 + 0
    expect(screen.queryByText("91.0점")).toBeNull(); // 68 + 활동 23
  });

  it("목표 점수 칸: 목표별 '달성 ÷ 목표 = 달성률'과 평균·참여·보너스가 내 기록으로 풀린다", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "나 점수 계산 보기" }));
    const g = text("live-goal-score");
    expect(g).toContain("목표 점수");
    expect(g).toContain("운동한 날 · 달성 6일 ÷ 목표 10일 = 60%"); // 내 실적 6, 목표 10
    expect(g).toContain("평균 달성률 60% × 0.8"); // 목표 달성
    expect(g).toContain("+48.00점");
    expect(g).toContain("실제 17일 / 계획 13일"); // 참여 — 거꾸로 계산한 13일이 아니다
    expect(g).toContain("참여점수 20점");
    expect(g).toContain("만점에서 멈춰요");
    expect(g).not.toContain("실제 13일");
    expect(g).toContain("100% 완료한 목표 0개");
    expect(g).toContain("목표 점수 합계 68.00점");
  });

  it("활동 점수 칸: 운동한 날·횟수·시간이 각각 1일·1회·60분당 1점으로 풀리고 합계가 나온다", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "나 점수 계산 보기" }));
    const a = text("live-activity-score");
    expect(a).toContain("활동 점수");
    expect(a).toContain("운동한 날 17일 × 1점 = +17점");
    expect(a).toContain("운동 3회 × 1점 = +3점");
    expect(a).toContain("운동 시간 180분 ÷ 60 = +3점");
    expect(a).toContain("활동 점수 합계 +23.00점");
  });

  it("활동 점수는 순위에 아직 안 더해진다고 분명히 말한다", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "나 점수 계산 보기" }));
    const a = text("live-activity-score");
    expect(a).toContain("챌린지가 끝난 뒤 순위에 더해져요");
    expect(a).toContain("지금은 순위에 반영되지 않아요");
  });

  it("다른 참가자 줄도 같은 방식 — 그 사람 기록(3일 / 2회 / 60분)으로 풀린다", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "참가자1 점수 계산 보기" }));
    const g = text("live-goal-score");
    expect(g).toContain("달성 9일 ÷ 목표 10일 = 90%");
    expect(g).toContain("실제 3일 / 계획 13일");
    expect(g).toContain("참여점수 4.62점");
    expect(g).not.toContain("만점에서 멈춰요");
    const a = text("live-activity-score");
    expect(a).toContain("운동한 날 3일 × 1점 = +3점");
    expect(a).toContain("운동 2회 × 1점 = +2점");
    expect(a).toContain("운동 시간 60분 ÷ 60 = +1점");
  });

  it("다시 누르면 접히고, 두 줄을 동시에 펼칠 수 있다", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "나 점수 계산 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "참가자1 점수 계산 보기" }));
    expect(screen.getAllByTestId("live-score-detail")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "나 점수 계산 접기" }));
    expect(screen.getAllByTestId("live-score-detail")).toHaveLength(1);
  });

  it("v2 정보가 없는 옛 순위 줄(v1)은 눌러도 펼쳐지지 않는다 — 점수를 지어내지 않는다", () => {
    setup([session("me", 1)], 2, {
      initial: "overall",
      overallRanked: [
        { userId: "me", rank: 1, achievement: 60, participation: 50, overall: 58, completedGoalCount: 0 },
        { userId: "p1", rank: 2, achievement: 40, participation: 50, overall: 42, completedGoalCount: 0 },
      ],
    });
    expect(screen.queryByRole("button", { name: /점수 계산/ })).toBeNull();
  });

  it("종목 탭(운동 시간 등)의 줄은 눌러도 펼쳐지지 않는다 — 점수가 아니라서", () => {
    setup([session("me", 1)], 2);
    expect(screen.queryByRole("button", { name: /점수 계산/ })).toBeNull();
  });
});
