// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeParticipantProfile, PeriodSessionRow } from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";

const mocks = vi.hoisted(() => ({ getMyRewardLedgers: vi.fn() }));
vi.mock("@/lib/challenge-rewards", () => ({ getMyRewardLedgers: mocks.getMyRewardLedgers }));

import { ResultView } from "./challenge-result";

afterEach(cleanup);
beforeEach(() => {
  mocks.getMyRewardLedgers.mockReset();
  mocks.getMyRewardLedgers.mockResolvedValue({
    currentTotalXp: 1250,
    xpRows: [{ amount: 300, transactionType: "earn", createdAt: "2026-09-03T01:00:00Z" }],
    pointRows: [{ amount: 200, transactionType: "earn", createdAt: "2026-09-03T01:00:00Z" }],
    badgeEarnedAts: ["2026-09-05T01:00:00Z"],
  });
});

const goal = (user_id: string, goal_type: string, target_value: number, unit: string) =>
  ({
    id: `${user_id}-${goal_type}`,
    user_id,
    goal_type,
    target_value,
    qualifier: null,
    planned_days: 3,
    unit,
  }) as unknown as UserGoal;
const row = (userId: string, iso: string): PeriodSessionRow => ({
  userId,
  completedAt: iso,
  durationMinutes: 40,
  exercises: [],
});
const profiles: Record<string, ChallengeParticipantProfile> = {
  me: { id: "me", nickname: "나", avatar_url: null } as unknown as ChallengeParticipantProfile,
  b: { id: "b", nickname: "스칼레또", avatar_url: null } as unknown as ChallengeParticipantProfile,
};

function setup(myGoals = true) {
  const participants = [
    ...(myGoals
      ? [
          {
            userId: "me",
            goals: [
              { type: "workout_days" as const, target: 4, actual: 2 },
              { type: "cardio_distance" as const, target: 10, actual: 12 },
            ],
            workoutDays: 2,
            plannedDays: 6,
          },
        ]
      : []),
    {
      userId: "b",
      goals: [{ type: "workout_days" as const, target: 4, actual: 1 }],
      workoutDays: 1,
      plannedDays: 6,
    },
  ];
  render(
    <ResultView
      challenge={{ id: "c1", name: "GND 9월 챌린지", start_date: "2026-09-01", end_date: "2026-09-14" }}
      participants={participants}
      goals={
        myGoals
          ? [goal("me", "workout_days", 4, "일"), goal("me", "cardio_distance", 10, "km"), goal("b", "workout_days", 4, "일")]
          : [goal("b", "workout_days", 4, "일")]
      }
      sessionRows={[
        row("me", "2026-09-01T01:00:00Z"),
        row("me", "2026-09-02T01:00:00Z"),
        row("b", "2026-09-01T01:00:00Z"),
      ]}
      plans={[{ planDate: "2026-09-02", setCount: 6 }]}
      timeZone="Asia/Seoul"
      profileOf={(id) => profiles[id]}
      myUserId="me"
      onBack={() => {}}
      onProfileClick={() => {}}
      onCreate={() => {}}
    />,
  );
}

describe("ResultView — 화면 A (챌린지 종료!)", () => {
  it("시안 머리, 2×2 카드 4장, 주간 2칸, 보상 3칸", async () => {
    setup();
    expect(screen.getByText("종료!")).toBeTruthy();
    expect(screen.getByText(/14일간, 정말 수고했어요!/)).toBeTruthy();
    expect(screen.getAllByTestId("stat-card")).toHaveLength(4);
    expect(screen.getAllByTestId("heat-week")).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByTestId("reward-tile")).toHaveLength(3));
    expect(screen.getByText("+200")).toBeTruthy();
    expect(screen.getByText(/\+1 레벨 업!/)).toBeTruthy(); // 950 XP(Lv.5) → 1250 XP(Lv.6)
    expect(screen.getByRole("button", { name: /결과 공유하기/ })).toBeTruthy();
  });

  it("시안의 지급 없는 보상(랜덤 상자·코인)은 없다", async () => {
    setup();
    await waitFor(() => screen.getAllByTestId("reward-tile"));
    expect(screen.queryByText(/랜덤 아이템|코인/)).toBeNull();
  });

  it("장부 조회가 실패해도 화면은 뜨고 레벨·보상 칸만 숨는다", async () => {
    mocks.getMyRewardLedgers.mockRejectedValueOnce(new Error("x"));
    setup();
    expect(screen.getAllByTestId("stat-card")).toHaveLength(4);
    await waitFor(() => expect(mocks.getMyRewardLedgers).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "나의 챌린지 결과 보기" })).toBeTruthy();
    expect(screen.queryByTestId("reward-tile")).toBeNull();
  });

  it("목표를 안 건 사람은 시상대만", () => {
    setup(false);
    expect(screen.getByText("종료!")).toBeTruthy();
    expect(screen.queryByTestId("stat-card")).toBeNull();
    expect(screen.queryByRole("button", { name: /결과 공유하기/ })).toBeNull();
  });
});

describe("ResultView — 화면 B (나의 챌린지 결과)", () => {
  it("레벨 카드를 누르면 열리고, 뒤로 가면 A", async () => {
    setup();
    await screen.findAllByTestId("reward-tile"); // 장부가 와서 레벨 카드로 바뀐 뒤에 누른다
    fireEvent.click(screen.getByRole("button", { name: "나의 챌린지 결과 보기" }));
    expect(screen.getByText("나의 챌린지 결과")).toBeTruthy();
    expect(screen.getByText(/상위 50%/)).toBeTruthy();
    expect(screen.getAllByTestId("goal-ring")).toHaveLength(2);
    expect(screen.getByText("목표 2개 중 1개 달성!")).toBeTruthy();
    expect(screen.getAllByTestId("day-bar")).toHaveLength(14);
    expect(screen.getAllByTestId("best-record")).toHaveLength(4);
    expect(screen.getAllByTestId("trend-point")).toHaveLength(3); // 시작·1주·2주
    expect(screen.getByRole("button", { name: /다음 챌린지 신청하기/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(screen.getByText("종료!")).toBeTruthy();
  });
});

describe("ResultView — 참가자가 많을 때", () => {
  it("30명: 4~10위 + 내 줄만, 전체 보기로 펼친다", () => {
    const n = 30;
    const participants = Array.from({ length: n }, (_, i) => ({
      userId: i === 24 ? "me" : `p${i}`,
      goals: [{ type: "workout_days" as const, target: 30, actual: n - i }],
      workoutDays: n - i,
      plannedDays: 30,
    }));
    render(
      <ResultView
        challenge={{ id: "big", name: "큰 방", start_date: "2026-09-01", end_date: "2026-09-28" }}
        participants={participants}
        goals={participants.map((p) => goal(p.userId, "workout_days", 30, "일"))}
        sessionRows={[]}
        plans={[]}
        timeZone="Asia/Seoul"
        profileOf={(id) => ({ id, nickname: id, avatar_url: null }) as unknown as ChallengeParticipantProfile}
        myUserId="me"
        onBack={() => {}}
        onProfileClick={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(screen.getAllByTestId("rest-rank")).toHaveLength(8);
    expect(screen.getByText("25위")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "전체 30명 보기" }));
    expect(screen.getAllByTestId("rest-rank")).toHaveLength(27);
  });
});
