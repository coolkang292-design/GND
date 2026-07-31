// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  clearPendingChallengeInvite: vi.fn(),
  joinChallengeWithCode: vi.fn(),
  peekPendingChallengeInvite: vi.fn(),
  clearPendingInvite: vi.fn(),
  createGroup: vi.fn(),
  joinGroupWithCode: vi.fn(),
  peekPendingInvite: vi.fn(),
  upsertMyProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    userId: "fresh-user",
    loading: false,
    configured: true,
  }),
}));

vi.mock("@/lib/challenge", () => ({
  clearPendingChallengeInvite: mocks.clearPendingChallengeInvite,
  joinChallengeWithCode: mocks.joinChallengeWithCode,
  peekPendingChallengeInvite: mocks.peekPendingChallengeInvite,
}));

vi.mock("@/lib/crew", () => ({
  clearPendingInvite: mocks.clearPendingInvite,
  createGroup: mocks.createGroup,
  joinGroupWithCode: mocks.joinGroupWithCode,
  peekPendingInvite: mocks.peekPendingInvite,
  upsertMyProfile: mocks.upsertMyProfile,
}));

import OnboardingPage from "./page";

describe("OnboardingPage 챌린지 초대 모드", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.peekPendingInvite.mockReturnValue(null);
    mocks.peekPendingChallengeInvite.mockReturnValue("GND-ABCDE");
    mocks.upsertMyProfile.mockResolvedValue(undefined);
    mocks.joinChallengeWithCode.mockResolvedValue({
      challengeId: "challenge-1",
      challengeName: "테스트 챌린지",
      crewLinked: 0,
    });
  });

  afterEach(() => cleanup());

  it("닉네임과 챌린지 참가 버튼만 보여준다", () => {
    render(<OnboardingPage />);

    expect(
      screen.getByRole("heading", {
        name: "챌린지에 초대받았어요 🏆",
      }),
    ).not.toBeNull();
    expect(
      screen.getByPlaceholderText("닉네임 (예: 형)"),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "챌린지 참가하기" }),
    ).not.toBeNull();
    expect(screen.queryByText("프로필 사진")).toBeNull();
    expect(screen.queryByText("주간 운동 목표")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "다음" }),
    ).toBeNull();
    expect(screen.queryByText("크루에 들어가요")).toBeNull();
    expect(
      screen.queryByText("이미 계정이 있나요? 로그인"),
    ).toBeNull();
  });

  it("닉네임을 저장하고 챌린지에 참가한 뒤 챌린지 화면으로 이동한다", async () => {
    render(<OnboardingPage />);

    fireEvent.change(
      screen.getByPlaceholderText("닉네임 (예: 형)"),
      { target: { value: "새참가자" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "챌린지 참가하기" }),
    );

    await waitFor(() =>
      expect(mocks.joinChallengeWithCode).toHaveBeenCalledWith(
        "GND-ABCDE",
      ),
    );
    expect(mocks.upsertMyProfile).toHaveBeenCalledWith({
      id: "fresh-user",
      nickname: "새참가자",
      avatar_url: "🧔",
      weekly_goal: 3,
    });
    expect(mocks.clearPendingChallengeInvite).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/challenge");
    expect(
      mocks.upsertMyProfile.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.joinChallengeWithCode.mock.invocationCallOrder[0],
    );
  });

  it("참가 실패 시 코드를 남기고 같은 화면에서 다시 시도하게 한다", async () => {
    mocks.joinChallengeWithCode.mockRejectedValue(
      new Error("invalid_code"),
    );
    render(<OnboardingPage />);

    fireEvent.change(
      screen.getByPlaceholderText("닉네임 (예: 형)"),
      { target: { value: "새참가자" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "챌린지 참가하기" }),
    );

    await screen.findByText(
      "챌린지에 참가하지 못했어요. 초대 링크를 다시 확인해 주세요.",
    );
    expect(mocks.clearPendingChallengeInvite).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "챌린지 참가하기" }),
    ).not.toBeNull();
  });
});
