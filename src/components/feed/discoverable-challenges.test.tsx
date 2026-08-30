// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(cleanup);

const mocks = vi.hoisted(() => ({
  getDiscoverableChallenges: vi.fn(),
  joinDiscoverableChallenge: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/challenge", () => ({
  getDiscoverableChallenges: mocks.getDiscoverableChallenges,
  joinDiscoverableChallenge: mocks.joinDiscoverableChallenge,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ userId: "me", loading: false, configured: true }),
}));

import { DiscoverableChallenges } from "./discoverable-challenges";

function challenge(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "9월 같이 달려요",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    photoRequired: true,
    participantCount: 3,
    hostId: "host-1",
    hostNickname: "오빙크",
    hostAvatarUrl: null,
    alreadyJoined: false,
    ...over,
  };
}

beforeEach(() => {
  mocks.getDiscoverableChallenges.mockReset();
  mocks.joinDiscoverableChallenge.mockReset();
  mocks.push.mockReset();
});

describe("DiscoverableChallenges", () => {
  it("공개 챌린지를 카드로 그린다", async () => {
    mocks.getDiscoverableChallenges.mockResolvedValue([challenge()]);
    render(<DiscoverableChallenges />);

    expect(await screen.findByText("9월 같이 달려요")).toBeTruthy();
    expect(screen.getByText("오빙크")).toBeTruthy();
    expect(screen.getByText(/9\/1 시작 · 참가 3명/)).toBeTruthy();
  });

  /**
   * ⚠️⚠️ 회귀 방어. `items.length === 0`만 보고 null을 돌려주면, 거절 직후
   * 마지막 카드를 뺐을 때 **오류 문구까지 같이 사라진다.**
   */
  it("거절 뒤 카드가 없어져도 오류 문구는 남는다", async () => {
    mocks.getDiscoverableChallenges.mockResolvedValue([challenge()]);
    mocks.joinDiscoverableChallenge.mockRejectedValue(
      new Error("not_discoverable"),
    );
    render(<DiscoverableChallenges />);

    fireEvent.click(await screen.findByRole("button", { name: "참여하기" }));
    expect(await screen.findByText("모집이 끝난 챌린지예요")).toBeTruthy();
    expect(screen.queryByText("9월 같이 달려요")).toBeNull();
  });

  /** ⚠️ 빈 제목만 남으면 고장 난 것처럼 보인다. 0개면 영역 자체가 없어야 한다 */
  it("0개면 영역 자체를 그리지 않는다", async () => {
    mocks.getDiscoverableChallenges.mockResolvedValue([]);
    const { container } = render(<DiscoverableChallenges />);
    await waitFor(() => expect(mocks.getDiscoverableChallenges).toHaveBeenCalled());
    expect(container.textContent).not.toContain("같이 할 챌린지");
  });

  /**
   * ⚠️⚠️ 회귀 방어. 이 조회가 피드 목록에 딸려 있으면 **크루 0명인 신규
   * 사용자에게 안 보인다** — 이 기능이 가장 필요한 사람이다. 스스로 조회한다.
   */
  it("피드 목록과 무관하게 스스로 조회한다", async () => {
    mocks.getDiscoverableChallenges.mockResolvedValue([challenge()]);
    render(<DiscoverableChallenges />);
    await waitFor(() =>
      expect(mocks.getDiscoverableChallenges).toHaveBeenCalledTimes(1),
    );
  });

  /**
   * ⚠️ 이미 참가한 방을 감추면 내가 들어간 방이 사라진 것처럼 보인다.
   * 버튼만 바꾼다.
   */
  it("이미 참가했으면 감추지 않고 버튼만 바꾼다", async () => {
    mocks.getDiscoverableChallenges.mockResolvedValue([
      challenge({ alreadyJoined: true }),
    ]);
    render(<DiscoverableChallenges />);

    expect(await screen.findByText("9월 같이 달려요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "참가 중 · 보기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "참여하기" })).toBeNull();
  });

  it("참가 중인 카드를 누르면 참가 RPC 없이 그 챌린지로 간다", async () => {
    mocks.getDiscoverableChallenges.mockResolvedValue([
      challenge({ alreadyJoined: true }),
    ]);
    render(<DiscoverableChallenges />);

    fireEvent.click(await screen.findByRole("button", { name: "참가 중 · 보기" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/challenge?open=c1"));
    expect(mocks.joinDiscoverableChallenge).not.toHaveBeenCalled();
  });

  it("참여하면 그 챌린지 화면으로 보낸다", async () => {
    mocks.getDiscoverableChallenges.mockResolvedValue([challenge()]);
    mocks.joinDiscoverableChallenge.mockResolvedValue({
      challengeId: "c1",
      challengeName: "9월 같이 달려요",
    });
    render(<DiscoverableChallenges />);

    fireEvent.click(await screen.findByRole("button", { name: "참여하기" }));
    await waitFor(() =>
      expect(mocks.joinDiscoverableChallenge).toHaveBeenCalledWith("c1"),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/challenge?open=c1"),
    );
  });

  /**
   * ⚠️⚠️ 방장이 방금 시작했거나 모집을 껐으면 서버가 거절한다. 그때 카드를
   * 그대로 두면 사용자가 계속 눌러도 계속 실패한다 — 목록에서 뺀다.
   */
  it("서버가 거절하면 이유를 말하고 카드를 뺀다", async () => {
    mocks.getDiscoverableChallenges.mockResolvedValue([challenge()]);
    mocks.joinDiscoverableChallenge.mockRejectedValue(
      new Error("invalid_status:active"),
    );
    render(<DiscoverableChallenges />);

    fireEvent.click(await screen.findByRole("button", { name: "참여하기" }));
    expect(await screen.findByText("이미 시작한 챌린지예요")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByText("9월 같이 달려요")).toBeNull(),
    );
  });

  it("모집이 내려간 챌린지는 그렇게 말해 준다", async () => {
    mocks.getDiscoverableChallenges.mockResolvedValue([challenge()]);
    mocks.joinDiscoverableChallenge.mockRejectedValue(
      new Error("not_discoverable"),
    );
    render(<DiscoverableChallenges />);

    fireEvent.click(await screen.findByRole("button", { name: "참여하기" }));
    expect(await screen.findByText("모집이 끝난 챌린지예요")).toBeTruthy();
  });

  /** 사진 비필수 챌린지도 있을 수 있다 — 표식을 항상 붙이면 거짓말이 된다 */
  it("photoRequired가 false면 인증 표식을 안 붙인다", async () => {
    mocks.getDiscoverableChallenges.mockResolvedValue([
      challenge({ photoRequired: false }),
    ]);
    render(<DiscoverableChallenges />);

    expect(await screen.findByText("9월 같이 달려요")).toBeTruthy();
    expect(screen.queryByText(/📷 인증/)).toBeNull();
  });
});
