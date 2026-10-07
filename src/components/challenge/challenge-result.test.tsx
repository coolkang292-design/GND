// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  ({ id: `${user_id}-${goal_type}`, user_id, goal_type, target_value, qualifier: null, planned_days: 3, unit }) as unknown as UserGoal;
const row = (userId: string, iso: string, km = 0): PeriodSessionRow => ({
  userId,
  completedAt: iso,
  durationMinutes: 40,
  exercises: [
    {
      exerciseType: "cardio",
      exerciseName: "러닝",
      bodyPart: null,
      sets: [{ weightKg: null, reps: null, distanceMeters: km * 1000, durationSeconds: null, isCompleted: true }],
    },
  ],
});
const profile = (id: string, nickname: string) =>
  ({ id, nickname, avatar_url: null }) as unknown as ChallengeParticipantProfile;

function setup(opts: { myGoals?: boolean; n?: number } = {}) {
  const myGoals = opts.myGoals ?? true;
  const n = opts.n ?? 2;
  const ids = Array.from({ length: n }, (_, i) => (i === 0 ? "me" : `p${i}`));
  const members = ids.map((id) => profile(id, id === "me" ? "나" : `참가자${id}`));
  const rows = [
    row("me", "2026-09-01T01:00:00Z", 5),
    row("me", "2026-09-02T01:00:00Z"),
    ...ids.slice(1).map((id) => row(id, "2026-09-01T01:00:00Z", 1)),
  ];
  const participants = ids
    .filter((id) => myGoals || id !== "me")
    .map((id) => ({
      userId: id,
      goals: [{ type: "workout_days" as const, target: 4, actual: id === "me" ? 2 : 1 }],
      workoutDays: id === "me" ? 2 : 1,
      plannedDays: 6,
    }));
  const onDiscover = vi.fn();
  render(
    <ResultView
      challenge={{ id: "c1", name: "9월 개노답 탈출 챌린지", start_date: "2026-09-01", end_date: "2026-09-14", recruit_image_url: null }}
      members={members}
      participants={participants}
      goals={participants.map((p) => goal(p.userId, "workout_days", 4, "일"))}
      sessionRows={rows}
      plans={[{ planDate: "2026-09-02", setCount: 6 }]}
      timeZone="Asia/Seoul"
      profileOf={(id) => members.find((m) => m.id === id)}
      myUserId="me"
      onBack={() => {}}
      onProfileClick={() => {}}
      onDiscover={onDiscover}
    />,
  );
  return { onDiscover };
}

describe("종료 화면 — 최종 시안 (히어로 + 4탭)", () => {
  it("히어로·4탭, 결과 요약이 먼저 — 내 순위·종합 점수·종목 4칸 순위", () => {
    setup();
    expect(screen.getByText("챌린지 결과")).toBeTruthy();
    expect(screen.getByText("종료")).toBeTruthy();
    expect(screen.getByText("9.1 (화) ~ 9.14 (월)")).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["결과 요약", "최종 랭킹", "기록 분석", "피드"]);
    const cells = screen.getAllByTestId("metric-cell");
    expect(cells).toHaveLength(4);
    expect(cells[0].textContent).toContain("2회");
    expect(cells[0].textContent).toContain("(1위)");
    expect(cells[2].textContent).toContain("5km");
    expect(cells[3].textContent).toContain("-"); // 볼륨 기록 없음
    expect(screen.getByText("최종 TOP 3")).toBeTruthy();
  });

  it("최종 랭킹 — 30명 전원, 종목 탭 전환, 기록 인증·다음 챌린지 참여하기(둘러보기)", () => {
    const { onDiscover } = setup({ n: 30 });
    fireEvent.click(screen.getByRole("tab", { name: "최종 랭킹" }));
    expect(screen.getAllByTestId("final-row")).toHaveLength(30);
    const mine = screen.getAllByTestId("final-row").find((r) => r.getAttribute("data-mine"));
    expect(within(mine!).getByText("나")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /유산소 거리/ }));
    expect(screen.getAllByTestId("final-row")[0].textContent).toContain("5km");
    expect(screen.getByText("챌린지 기록 인증")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음 챌린지 참여하기" }));
    expect(onDiscover).toHaveBeenCalled();
  });

  it("기록 분석 — 레벨·링·일별 활동·주요 기록·성장·보상", async () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "기록 분석" }));
    await waitFor(() => expect(screen.getAllByTestId("reward-tile")).toHaveLength(3));
    expect(screen.getByTestId("level-card")).toBeTruthy();
    expect(screen.getAllByTestId("goal-ring")).toHaveLength(1);
    expect(screen.getAllByTestId("day-bar")).toHaveLength(14);
    expect(screen.getAllByTestId("best-record")).toHaveLength(4);
    expect(screen.getAllByTestId("trend-point")).toHaveLength(3);
  });

  it("피드 탭 — 끝난 챌린지는 활동 피드가 닫혔다고 말한다", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "피드" }));
    expect(screen.getByText("챌린지가 끝나 활동 피드가 닫혔어요")).toBeTruthy();
  });

  it("목표를 안 건 사람 — 종합 점수 없음 안내, 기록 분석 탭·기록 인증 없음", () => {
    setup({ myGoals: false });
    expect(screen.getByText(/목표를 정하지 않아 종합 점수가 없어요/)).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "기록 분석" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "최종 랭킹" }));
    expect(screen.queryByText("챌린지 기록 인증")).toBeNull();
  });

  it("지급 없는 보상(랜덤 상자·코인)·열람권 문구는 어디에도 없다", async () => {
    setup();
    for (const t of ["결과 요약", "최종 랭킹", "기록 분석", "피드"]) {
      fireEvent.click(screen.getByRole("tab", { name: t }));
      expect(screen.queryByText(/랜덤 아이템|코인|열람권/)).toBeNull();
    }
  });
});
