// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(cleanup);

const mocks = vi.hoisted(() => ({
  getActiveCrewSessions: vi.fn(),
  sendCheer: vi.fn(),
}));

vi.mock("@/lib/social", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/social")>();
  return {
    ...actual,
    getActiveCrewSessions: mocks.getActiveCrewSessions,
    sendCheer: mocks.sendCheer,
  };
});

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ userId: "me", loading: false, configured: true }),
}));

import { ActiveWorkoutCards } from "./active-workout-cards";
import { StoryTray } from "./story-tray";

const OTHER = {
  sessionId: "s-other",
  userId: "u-other",
  nickname: "낭만송곳니",
  avatarUrl: null,
  startedAt: new Date(Date.now() - 12 * 60_000),
};
const MINE = {
  sessionId: "s-mine",
  userId: "me",
  nickname: "스칼레또",
  avatarUrl: null,
  startedAt: new Date(Date.now() - 5 * 60_000),
};

beforeEach(() => {
  mocks.getActiveCrewSessions.mockReset();
  mocks.sendCheer.mockReset();
  mocks.getActiveCrewSessions.mockResolvedValue([OTHER, MINE]);
  mocks.sendCheer.mockResolvedValue({ pointsAwarded: 0 });
});

/**
 * Phase C가 갈라 놓은 두 화면이 각자 제 모양인지 본다.
 *
 * 계획서가 명시한 위험이 **홈 회귀**다 — `ActiveWorkoutCards`는 원래 홈·피드
 * 공용이었고, 피드를 트레이로 바꾸면서 이 컴포넌트를 건드렸다. 홈이 카드로
 * 남았는지, 응원 버튼이 카드에서 바로 눌리는지를 못 박는다.
 */
describe("ActiveWorkoutCards — 홈은 그대로 카드다", () => {
  it("세션마다 카드를 그리고, 응원 버튼이 카드에서 바로 보인다", async () => {
    render(<ActiveWorkoutCards />);
    await screen.findByText("낭만송곳니");

    // 트레이와 달리 카드는 응원 버튼이 **접히지 않고** 바로 보인다.
    // 이게 사라지면 홈이 트레이로 바뀐 것이고, 그건 회귀다.
    expect(screen.getByText("불태워")).toBeTruthy();
    expect(screen.getByText("힘내")).toBeTruthy();
    expect(screen.getByText("한마디")).toBeTruthy();
  });

  it("내 운동 카드에는 응원 버튼이 없다", async () => {
    mocks.getActiveCrewSessions.mockResolvedValue([MINE]);
    render(<ActiveWorkoutCards />);
    await screen.findByText("스칼레또");
    expect(screen.getByText("(나)")).toBeTruthy();
    expect(screen.queryByText("불태워")).toBeNull();
  });

  // 홈은 같은 값을 친구 목록의 "🔥 운동 중" 판정에도 써서 이미 한 번 조회해
  // 내려준다. 여기서 또 부르면 같은 질의가 홈에서 두 번 나가고 폴링이 두 벌이
  // 된다 — 원래 주석이 경고하던 그 회귀다.
  it("sessions를 받으면 스스로 조회하지 않는다", async () => {
    render(<ActiveWorkoutCards sessions={[OTHER]} />);
    await screen.findByText("낭만송곳니");
    expect(mocks.getActiveCrewSessions).not.toHaveBeenCalled();
  });

  it("진행 중이 없으면 아무것도 그리지 않는다", async () => {
    mocks.getActiveCrewSessions.mockResolvedValue([]);
    const { container } = render(<ActiveWorkoutCards />);
    await waitFor(() => expect(mocks.getActiveCrewSessions).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

describe("StoryTray — 피드는 한 줄이다", () => {
  /**
   * 이 테스트가 Phase C의 존재 이유다. 카드는 1명당 세로 ~180px라 3명이 운동
   * 중이면 피드 첫 화면에 게시물이 하나도 안 보였다. 트레이에 응원 버튼이
   * 딸려 나오면 다시 높아져서 바꾼 의미가 없어진다.
   */
  it("접힌 상태에서는 응원 버튼이 없다", async () => {
    render(<StoryTray />);
    await screen.findByText("낭만송곳니");
    expect(screen.queryByText("불태워")).toBeNull();
    expect(screen.queryByText("한마디")).toBeNull();
  });

  it("사람마다 버튼 하나씩, 경과 분을 보여준다", async () => {
    render(<StoryTray />);
    await screen.findByText("낭만송곳니");
    // 내 것은 닉네임 대신 "나"로 줄여 자리를 아낀다
    expect(screen.getByText("나")).toBeTruthy();
    expect(screen.getByText("12분째")).toBeTruthy();
    expect(screen.getByText("5분째")).toBeTruthy();
  });

  it("탭하면 시트가 열리고 거기서 응원한다", async () => {
    render(<StoryTray />);
    const btn = await screen.findByLabelText(/낭만송곳니님 12분째 운동 중/);
    fireEvent.click(btn);

    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByText("불태워"));
    await waitFor(() =>
      expect(mocks.sendCheer).toHaveBeenCalledWith("s-other", "fire", undefined),
    );
  });

  it("내 운동 시트에는 응원 버튼 대신 안내가 뜬다", async () => {
    render(<StoryTray />);
    const btn = await screen.findByLabelText(/스칼레또님 5분째 운동 중/);
    fireEvent.click(btn);
    expect(screen.queryByText("불태워")).toBeNull();
    expect(screen.getByText(/크루가 응원을 보낼 수 있어요/)).toBeTruthy();
  });

  it("진행 중이 없으면 줄 자체를 그리지 않는다", async () => {
    mocks.getActiveCrewSessions.mockResolvedValue([]);
    const { container } = render(<StoryTray />);
    await waitFor(() => expect(mocks.getActiveCrewSessions).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
