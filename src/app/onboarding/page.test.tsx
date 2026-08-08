// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  clearPendingChallengeInvite: vi.fn(),
  joinChallengeWithCode: vi.fn(),
  joinChallengeAsNewcomer: vi.fn(),
  isNotNewcomer: vi.fn(),
  saveOnboardingNotice: vi.fn(),
  peekPendingChallengeInvite: vi.fn(),
  clearPendingInvite: vi.fn(),
  createGroup: vi.fn(),
  peekPendingInvite: vi.fn(),
  redeemInviteCode: vi.fn(),
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
  joinChallengeAsNewcomer: mocks.joinChallengeAsNewcomer,
  isNotNewcomer: mocks.isNotNewcomer,
  saveOnboardingNotice: mocks.saveOnboardingNotice,
  peekPendingChallengeInvite: mocks.peekPendingChallengeInvite,
}));

vi.mock("@/lib/crew", () => ({
  clearPendingInvite: mocks.clearPendingInvite,
  createGroup: mocks.createGroup,
  peekPendingInvite: mocks.peekPendingInvite,
  redeemInviteCode: mocks.redeemInviteCode,
  upsertMyProfile: mocks.upsertMyProfile,
}));

import OnboardingPage from "./page";

describe("OnboardingPage 챌린지 초대 모드", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.peekPendingInvite.mockReturnValue(null);
    mocks.peekPendingChallengeInvite.mockReturnValue("GND-ABCDE");
    mocks.upsertMyProfile.mockResolvedValue(undefined);
    // 기본은 **신입 경로**다 — 온보딩을 지나는 사람은 방금 프로필을 만든 사람이라
    // 서버(0063)가 신입으로 판정하는 것이 정상 흐름이다.
    mocks.joinChallengeAsNewcomer.mockResolvedValue({
      challengeId: "challenge-1",
      challengeName: "테스트 챌린지",
      crewLinked: 1,
      hostNickname: "방장형",
    });
    mocks.joinChallengeWithCode.mockResolvedValue({
      challengeId: "challenge-1",
      challengeName: "테스트 챌린지",
      crewLinked: 0,
    });
    // 실제 구현과 같은 판정을 쓴다. `true` 고정으로 두면 폴백이 모든 오류를
    // 삼키는 회귀를 테스트가 못 잡는다.
    mocks.isNotNewcomer.mockImplementation(
      (e: unknown) => e instanceof Error && e.message.includes("not_newcomer"),
    );
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

  async function submitNickname(nick = "새참가자") {
    render(<OnboardingPage />);
    fireEvent.change(
      screen.getByPlaceholderText("닉네임 (예: 형)"),
      { target: { value: nick } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "챌린지 참가하기" }),
    );
  }

  it("신입은 방장과 친구까지 맺고 챌린지 화면으로 이동한다", async () => {
    await submitNickname();

    await waitFor(() =>
      expect(mocks.joinChallengeAsNewcomer).toHaveBeenCalledWith(
        "GND-ABCDE",
      ),
    );
    expect(mocks.upsertMyProfile).toHaveBeenCalledWith({
      id: "fresh-user",
      nickname: "새참가자",
      avatar_url: "🧔",
      weekly_goal: 3,
    });
    // 신입이 성공했으면 폴백은 부르지 않는다 — 두 번 참가시키면 안 된다.
    expect(mocks.joinChallengeWithCode).not.toHaveBeenCalled();
    // 참가와 친구 연결이 **동시에** 일어났으므로 화면이 둘 다 말해야 한다.
    // 방장 닉네임이 빠지면 "누구랑 친구가 됐는지" 알 수 없다.
    const notice = mocks.saveOnboardingNotice.mock.calls[0]?.[0] as string;
    expect(notice).toContain("방장형");
    expect(notice).toContain("테스트 챌린지");
    expect(mocks.clearPendingChallengeInvite).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/challenge");
    expect(
      mocks.upsertMyProfile.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.joinChallengeAsNewcomer.mock.invocationCallOrder[0],
    );
  });

  it("신입이 아니면 joinChallengeWithCode로 폴백해 참가는 시킨다", async () => {
    // ⚠️ 이 폴백이 없으면 **기존 사용자가 챌린지 링크로 아예 못 들어간다**
    // (세션이 끊겨 온보딩으로 떨어진 사람 등). 인수인계서 §8-4.
    mocks.joinChallengeAsNewcomer.mockRejectedValue(
      new Error("not_newcomer"),
    );
    await submitNickname("기존사용자");

    await waitFor(() =>
      expect(mocks.joinChallengeWithCode).toHaveBeenCalledWith(
        "GND-ABCDE",
      ),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/challenge");
    // 친구를 안 맺었으므로 방장 이름을 말하면 거짓말이 된다.
    const notice = mocks.saveOnboardingNotice.mock.calls[0]?.[0] as string;
    expect(notice).toContain("테스트 챌린지");
    expect(notice).not.toContain("친구가 됐어요");
  });

  it("참가 실패 시 코드를 남기고 같은 화면에서 다시 시도하게 한다", async () => {
    // 신입 판정과 무관한 오류(코드 자체가 틀림)는 폴백하지 않고 그대로 실패한다.
    mocks.joinChallengeAsNewcomer.mockRejectedValue(
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
    // 폴백이 모든 오류를 삼키면 틀린 코드로도 참가를 시도하게 된다.
    expect(mocks.joinChallengeWithCode).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "챌린지 참가하기" }),
    ).not.toBeNull();
  });
});

describe("OnboardingPage 친구 초대 링크 모드", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 챌린지가 아니라 **친구** 초대 링크로 들어온 사람 (`/invite/<코드>`가 보관).
    mocks.peekPendingChallengeInvite.mockReturnValue(null);
    mocks.peekPendingInvite.mockReturnValue("GND-7FDVC");
    mocks.upsertMyProfile.mockResolvedValue(undefined);
    mocks.redeemInviteCode.mockResolvedValue({
      kind: "friend",
      nickname: "낭만송곳니",
      alreadyFriends: false,
    });
  });

  afterEach(() => cleanup());

  async function finishProfile() {
    render(<OnboardingPage />);
    fireEvent.change(
      screen.getByPlaceholderText("닉네임 (예: 형)"),
      { target: { value: "새친구" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
  }

  /**
   * ⚠️ 0061 전에는 이 링크가 그룹 합류였고 마지막 화면이 "크루 참여 완료!"였다.
   * 이제 맺어지는 것은 **친구**다 — 크루 이름을 말하면 화면이 거짓말을 한다
   * (들어간 그룹이 없다).
   */
  it("친구를 맺으면 상대 닉네임을 말하고 크루 이름은 말하지 않는다", async () => {
    await finishProfile();

    await screen.findByRole("heading", { name: "친구가 됐어요!" });
    expect(mocks.redeemInviteCode).toHaveBeenCalledWith("GND-7FDVC");
    expect(screen.getByText(/낭만송곳니/)).not.toBeNull();
    expect(screen.queryByText(/크루 참여 완료/)).toBeNull();
    expect(screen.queryByText(/의 GND 챌린지에 함께해요/)).toBeNull();
  });

  it("이미 친구였으면 그렇게 말한다", async () => {
    mocks.redeemInviteCode.mockResolvedValue({
      kind: "friend",
      nickname: "낭만송곳니",
      alreadyFriends: true,
    });
    await finishProfile();

    await screen.findByRole("heading", { name: "이미 친구예요" });
    expect(screen.queryByRole("heading", { name: "친구가 됐어요!" })).toBeNull();
  });

  /** 옛 그룹 코드 링크(카카오톡에 뿌려진 것)는 여전히 그룹 합류로 끝난다 */
  it("옛 그룹 코드로 들어오면 크루 참여 완료로 끝난다", async () => {
    mocks.redeemInviteCode.mockResolvedValue({
      kind: "group",
      groupName: "불꽃 크루",
    });
    await finishProfile();

    await screen.findByRole("heading", { name: "크루 참여 완료!" });
    expect(screen.getByText(/불꽃 크루/)).not.toBeNull();
  });

  /**
   * 코드가 죽었다고 앱에 못 들어오게 막으면 안 된다 — 코드 입력 화면으로 보내
   * 사용자가 손으로 고칠 수 있게 한다.
   */
  it("코드가 죽었으면 코드 입력 화면으로 보낸다", async () => {
    mocks.redeemInviteCode.mockRejectedValue(new Error("invalid_invite_code"));
    await finishProfile();

    await screen.findByText("초대 코드를 확인해 주세요");
    expect(
      screen.getByRole("heading", { name: "초대 코드로 참여" }),
    ).not.toBeNull();
  });
});
