// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParticipantPerformanceCard } from "./participant-performance-card";

const mocks = vi.hoisted(() => ({
  getActiveChallengeRanking: vi.fn(),
  getChallengeParticipantProfiles: vi.fn(),
  getTodaysPeekTarget: vi.fn(),
  pickPeekTarget: vi.fn(),
  getMyChallenges: vi.fn(),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ userId: "me", loading: false, configured: true, error: null }),
}));

vi.mock("@/lib/challenge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/challenge")>();
  return {
    ...actual,
    getActiveChallengeRanking: mocks.getActiveChallengeRanking,
    getChallengeParticipantProfiles: mocks.getChallengeParticipantProfiles,
    getTodaysPeekTarget: mocks.getTodaysPeekTarget,
    pickPeekTarget: mocks.pickPeekTarget,
    getMyChallenges: mocks.getMyChallenges,
  };
});

/** 2026-08-07(금) 12:00 KST */
const NOW = new Date("2026-08-07T03:00:00Z");

/** 오늘 포함 5일 연속 — 오늘치는 30분 전이라 2시간 창이 열려 있다 */
function fiveConsecutiveDays(): Date[] {
  return [
    new Date("2026-08-07T02:30:00Z"), // 오늘 11:30 KST
    new Date("2026-08-06T02:00:00Z"),
    new Date("2026-08-05T02:00:00Z"),
    new Date("2026-08-04T02:00:00Z"),
    new Date("2026-08-03T02:00:00Z"),
  ];
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  mocks.getActiveChallengeRanking.mockResolvedValue({
    name: "8월 챌린지",
    list: [
      { userId: "me", rank: 1, overall: 80, achievement: 80 },
      { userId: "friend", rank: 2, overall: 60, achievement: 60 },
    ],
  });
  mocks.getChallengeParticipantProfiles.mockResolvedValue([
    { id: "friend", nickname: "낭만송곳니" },
  ]);
  mocks.getTodaysPeekTarget.mockResolvedValue(null);
});

describe("ParticipantPerformanceCard — 볼 챌린지를 스스로 고르지 않는다", () => {
  /**
   * ⚠️ 옛 홈 카드는 `getMyChallenges` → `pickPrimaryRow`로 대표를 직접 골랐다.
   * 챌린지 탭에는 사용자가 고른 챌린지가 따로 있어서, 그대로 두면 탭과 카드가
   * 서로 다른 챌린지를 보여준다(설계 §6.7).
   */
  it("부모가 준 challengeId로 조회한다", async () => {
    render(
      <ParticipantPerformanceCard
        challengeId="ch-2"
        endDate="2026-08-29"
        completedAts={fiveConsecutiveDays()}
      />,
    );
    await waitFor(() =>
      expect(mocks.getActiveChallengeRanking).toHaveBeenCalledWith("ch-2"),
    );
    expect(mocks.getChallengeParticipantProfiles).toHaveBeenCalledWith("ch-2");
    expect(mocks.getTodaysPeekTarget).toHaveBeenCalledWith("ch-2");
  });

  it("자기가 대표 챌린지를 고르지 않는다", async () => {
    render(
      <ParticipantPerformanceCard
        challengeId="ch-2"
        endDate="2026-08-29"
        completedAts={fiveConsecutiveDays()}
      />,
    );
    await waitFor(() =>
      expect(mocks.getActiveChallengeRanking).toHaveBeenCalled(),
    );
    expect(mocks.getMyChallenges).not.toHaveBeenCalled();
  });
});

describe("ParticipantPerformanceCard — 잠금", () => {
  it("5일 연속이 아니면 순위를 아예 조회하지 않는다 — 블러는 시각 처리일 뿐이다", async () => {
    render(
      <ParticipantPerformanceCard
        challengeId="ch-1"
        endDate="2026-08-29"
        completedAts={[new Date("2026-08-07T02:00:00Z")]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("챌린지 참가자 성과")).toBeTruthy(),
    );
    expect(mocks.getActiveChallengeRanking).not.toHaveBeenCalled();
    expect(screen.getByAltText("아직 볼 수 없어요")).toBeTruthy();
  });

  it("열리면 참가자 고르기가 뜨고 자물쇠가 사라진다", async () => {
    render(
      <ParticipantPerformanceCard
        challengeId="ch-1"
        endDate="2026-08-29"
        completedAts={fiveConsecutiveDays()}
      />,
    );
    await waitFor(() => expect(screen.getByText("낭만송곳니")).toBeTruthy());
    expect(screen.queryByAltText("아직 볼 수 없어요")).toBeNull();
    // 고르기 목록엔 순위·점수를 노출하지 않는다
    expect(screen.queryByText(/2위/)).toBeNull();
    expect(screen.queryByText(/60점/)).toBeNull();
  });

  it("D-day는 넘겨받은 종료일로 계산한다", async () => {
    render(
      <ParticipantPerformanceCard
        challengeId="ch-1"
        endDate="2026-08-10"
        completedAts={[]}
      />,
    );
    // 8/7 → 8/10 은 4일치 구간, 표시는 D-3
    await waitFor(() => expect(screen.getByText("D-3")).toBeTruthy());
  });
});
