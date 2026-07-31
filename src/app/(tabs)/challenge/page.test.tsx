// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyChallenge } from "@/lib/challenge";

const mocks = vi.hoisted(() => ({
  getMyGroups: vi.fn(),
  getMyProfile: vi.fn(),
  getMyChallenges: vi.fn(),
  getChallengeParticipantProfiles: vi.fn(),
  getChallengeGoals: vi.fn(),
  getChallengeApprovals: vi.fn(),
  getPeriodStatsByUser: vi.fn(),
  getMyPreviousGoals: vi.fn(),
  joinChallengeWithCode: vi.fn(),
  savePendingChallengeInvite: vi.fn(),
  clearPendingChallengeInvite: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    userId: "old-user",
    loading: false,
    configured: true,
    error: null,
  }),
}));

vi.mock("@/lib/crew", () => ({
  getMyGroups: mocks.getMyGroups,
  getMyProfile: mocks.getMyProfile,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: mocks.rpc }),
}));

vi.mock("@/lib/challenge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/challenge")>();
  return {
    ...actual,
    getMyChallenges: mocks.getMyChallenges,
    getChallengeParticipantProfiles: mocks.getChallengeParticipantProfiles,
    getChallengeGoals: mocks.getChallengeGoals,
    getChallengeApprovals: mocks.getChallengeApprovals,
    getPeriodStatsByUser: mocks.getPeriodStatsByUser,
    getMyPreviousGoals: mocks.getMyPreviousGoals,
    joinChallengeWithCode: mocks.joinChallengeWithCode,
    savePendingChallengeInvite: mocks.savePendingChallengeInvite,
    clearPendingChallengeInvite: mocks.clearPendingChallengeInvite,
  };
});

vi.mock("@/components/challenge/invite-sheet", () => ({
  InviteSheet: () => null,
}));

vi.mock("@/components/challenge/setup-sheet", () => ({
  ChallengeSetupSheet: ({ prevGoals }: { prevGoals: unknown }) => (
    <output data-testid="previous-goals">{JSON.stringify(prevGoals)}</output>
  ),
}));

import ChallengePage from "./page";

const challenge = (id: string, name: string, createdAt: string) =>
  ({
    id,
    group_id: "group-1",
    name,
    start_date: "2026-08-01",
    end_date: "2026-08-28",
    photo_required: true,
    status: "setup",
    created_by: "old-user",
    created_at: createdAt,
    myRole: "host",
    myStatus: "joined",
  }) satisfies MyChallenge;

const oldChallenge = challenge(
  "challenge-old",
  "예전 챌린지",
  "2026-07-01T00:00:00Z",
);
const newChallenge = challenge(
  "challenge-new",
  "새 챌린지",
  "2026-07-02T00:00:00Z",
);

const periodStats = {
  workoutDays: 1,
  workoutDayKeys: ["2026-08-01"],
  weightReps: 0,
  volumeKg: 0,
  cardioDistanceKm: 0,
  cardioTimeMin: 0,
  bodyweightReps: 0,
  bodyweightTimeMin: 0,
  tabataCount: 0,
  weightKindsByDay: { "2026-08-01": 3 },
  bodyweightKindsByDay: {},
};

function arrangeActiveTransition(
  loadNewStats: () => Promise<Map<string, typeof periodStats>>,
) {
  const oldActive = {
    ...oldChallenge,
    status: "active" as const,
    end_date: "2026-08-20",
  };
  const newActive = {
    ...newChallenge,
    status: "active" as const,
    end_date: "2026-08-28",
  };
  const goalFor = (challengeId: string) => ({
    id: `goal-${challengeId}`,
    user_id: "old-user",
    challenge_id: challengeId,
    group_id: "group-1",
    goal_type: "weight_days" as const,
    target_value: 1,
    unit: "일",
    planned_days: 5,
    qualifier: 3,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  });

  mocks.getMyChallenges.mockResolvedValue([oldActive, newActive]);
  mocks.getChallengeParticipantProfiles.mockImplementation(
    async (challengeId: string) => [
      {
        id: "old-user",
        nickname:
          challengeId === oldActive.id ? "예전 참가자" : "새 참가자",
        avatar_url: null,
      },
    ],
  );
  mocks.getChallengeGoals.mockImplementation(async (challengeId: string) => [
    goalFor(challengeId),
  ]);
  mocks.getChallengeApprovals.mockResolvedValue(new Set(["old-user"]));
  mocks.getPeriodStatsByUser.mockImplementation((challengeId: string) =>
    challengeId === oldActive.id
      ? Promise.resolve(new Map([["old-user", periodStats]]))
      : loadNewStats(),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/challenge");

  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.getMyGroups.mockResolvedValue([
    {
      id: "group-1",
      name: "테스트 크루",
      invite_code: "GND-TEST",
      owner_id: "old-user",
      created_at: "2026-07-01T00:00:00Z",
    },
  ]);
  mocks.getMyProfile.mockResolvedValue({
    id: "old-user",
    nickname: "예전 참가자",
    avatar_url: null,
    weekly_goal: 3,
    timezone: "Asia/Seoul",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  });
  mocks.getMyChallenges.mockResolvedValue([oldChallenge, newChallenge]);
  mocks.getChallengeParticipantProfiles.mockImplementation(
    async (challengeId: string) => {
      if (challengeId === oldChallenge.id) {
        return [
          {
            id: "old-user",
            nickname: "예전 참가자",
            avatar_url: null,
          },
        ];
      }
      return new Promise(() => {});
    },
  );
  mocks.getChallengeGoals.mockImplementation(async (challengeId: string) =>
    challengeId === oldChallenge.id
      ? [
          {
            id: "old-goal",
            user_id: "old-user",
            challenge_id: oldChallenge.id,
            group_id: "group-1",
            goal_type: "weight_days",
            target_value: 12,
            unit: "일",
            planned_days: 5,
            qualifier: 3,
            created_at: "2026-07-01T00:00:00Z",
            updated_at: "2026-07-01T00:00:00Z",
          },
        ]
      : [],
  );
  mocks.getChallengeApprovals.mockImplementation(async (challengeId: string) =>
    challengeId === oldChallenge.id ? new Set(["old-user"]) : new Set(),
  );
  mocks.getPeriodStatsByUser.mockResolvedValue(new Map());
  mocks.joinChallengeWithCode.mockResolvedValue({
    challengeId: "challenge-invite",
    challengeName: "초대 챌린지",
    status: "joined",
  });
  mocks.getMyPreviousGoals.mockImplementation(async (_userId, _groupId, challengeId) =>
    challengeId === oldChallenge.id
      ? [
          {
            goal_type: "weight_days",
            target_value: 12,
            qualifier: 3,
          },
        ]
      : [],
  );
});

afterEach(() => cleanup());

describe("ChallengePage 신규 사용자 초대 링크", () => {
  it("프로필이 없으면 초대 코드를 보관만 하고 온보딩 전에 참가하거나 지우지 않는다", async () => {
    window.history.replaceState(
      {},
      "",
      "/challenge?join=GND-ABCDE",
    );
    mocks.getMyProfile.mockResolvedValue(null);
    mocks.getMyChallenges.mockResolvedValue([]);

    render(<ChallengePage />);

    await waitFor(() =>
      expect(mocks.savePendingChallengeInvite).toHaveBeenCalledWith(
        "GND-ABCDE",
      ),
    );
    await waitFor(() => expect(mocks.getMyProfile).toHaveBeenCalled());

    expect(mocks.joinChallengeWithCode).not.toHaveBeenCalled();
    expect(mocks.clearPendingChallengeInvite).not.toHaveBeenCalled();
  });

  it("프로필이 있으면 기존처럼 초대 코드로 바로 참가하고 보관 코드를 지운다", async () => {
    window.history.replaceState(
      {},
      "",
      "/challenge?join=GND-ABCDE",
    );

    render(<ChallengePage />);

    await waitFor(() =>
      expect(mocks.joinChallengeWithCode).toHaveBeenCalledWith(
        "GND-ABCDE",
      ),
    );
    await waitFor(() =>
      expect(mocks.clearPendingChallengeInvite).toHaveBeenCalled(),
    );
  });
});

describe("ChallengePage 챌린지 전환", () => {
  it("새 챌린지를 고르면 새 조회가 끝나기 전에 이전 상세 정보를 즉시 비운다", async () => {
    render(<ChallengePage />);

    await screen.findByText("예전 참가자");
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    await waitFor(() =>
      expect(screen.getByTestId("previous-goals").textContent).toContain(
        '"target":12',
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /새 챌린지준비 중/ }),
    );

    expect(screen.getByText(/새 챌린지 ·/)).not.toBeNull();
    expect(screen.queryByText("예전 참가자")).toBeNull();
    expect(screen.getByTestId("previous-goals").textContent).toBe("null");
  });

  it("새 챌린지 조회가 실패해도 이전 상세 정보를 다시 보여주지 않는다", async () => {
    mocks.getChallengeParticipantProfiles.mockImplementation(
      async (challengeId: string) => {
        if (challengeId === oldChallenge.id) {
          return [
            {
              id: "old-user",
              nickname: "예전 참가자",
              avatar_url: null,
            },
          ];
        }
        throw new Error("새 챌린지 조회 실패");
      },
    );

    render(<ChallengePage />);

    await screen.findByText("예전 참가자");
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    await waitFor(() =>
      expect(screen.getByTestId("previous-goals").textContent).toContain(
        '"target":12',
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /새 챌린지준비 중/ }),
    );
    await screen.findByText("챌린지 정보를 불러오지 못했어요");

    expect(screen.queryByText("예전 참가자")).toBeNull();
    expect(screen.getByTestId("previous-goals").textContent).toBe("null");
  });

  it("진행 중 챌린지는 점수 조회를 기다리는 동안 상세 정보와 0점을 열지 않는다", async () => {
    let finishStats!: (stats: Map<string, typeof periodStats>) => void;
    arrangeActiveTransition(
      () =>
        new Promise((resolve) => {
          finishStats = resolve;
        }),
    );
    render(<ChallengePage />);

    await screen.findByText("예전 참가자");
    fireEvent.click(
      screen.getByRole("button", { name: /새 챌린지진행 중/ }),
    );
    await waitFor(() =>
      expect(mocks.getPeriodStatsByUser).toHaveBeenCalledWith(
        newChallenge.id,
        newChallenge.start_date,
        "2026-08-28",
        "Asia/Seoul",
      ),
    );

    expect(screen.queryByText("예전 참가자")).toBeNull();
    expect(screen.queryByText("새 참가자")).toBeNull();
    expect(screen.queryByText("0.0")).toBeNull();

    await act(async () => {
      finishStats(new Map([["old-user", periodStats]]));
    });
    expect(await screen.findByText("새 참가자")).not.toBeNull();
  });

  it("진행 중 챌린지 점수 조회가 실패해도 새 상세 정보를 완료된 것처럼 열지 않는다", async () => {
    arrangeActiveTransition(() => Promise.reject(new Error("점수 조회 실패")));
    render(<ChallengePage />);

    await screen.findByText("예전 참가자");
    fireEvent.click(
      screen.getByRole("button", { name: /새 챌린지진행 중/ }),
    );
    await screen.findByText("챌린지 정보를 불러오지 못했어요");

    expect(screen.queryByText("예전 참가자")).toBeNull();
    expect(screen.queryByText("새 참가자")).toBeNull();
    expect(screen.queryByText("0.0")).toBeNull();
  });
});
