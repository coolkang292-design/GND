// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  getUser: vi.fn(),
  replace: vi.fn(),
  savePendingChallengeInvite: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    userId: "fresh-user",
    loading: false,
    configured: true,
  }),
}));

vi.mock("@/lib/crew", () => ({
  getMyProfile: mocks.getMyProfile,
}));

vi.mock("@/lib/challenge", () => ({
  savePendingChallengeInvite: mocks.savePendingChallengeInvite,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

import { OnboardingGate } from "./onboarding-gate";

describe("OnboardingGate 챌린지 초대 코드 보관", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/home");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "fresh-user" } },
      error: null,
    });
  });

  afterEach(() => cleanup());

  it("프로필 확인보다 먼저 챌린지 초대 코드를 보관한다", () => {
    window.history.replaceState(
      {},
      "",
      "/challenge?join=GND-ABCDE",
    );
    mocks.getMyProfile.mockReturnValue(new Promise(() => {}));

    render(<OnboardingGate />);

    expect(mocks.savePendingChallengeInvite).toHaveBeenCalledWith(
      "GND-ABCDE",
    );
  });

  it("프로필이 없으면 코드를 보관한 뒤 온보딩으로 이동한다", async () => {
    window.history.replaceState(
      {},
      "",
      "/challenge?join=GND-ABCDE",
    );
    mocks.getMyProfile.mockResolvedValue(null);

    render(<OnboardingGate />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/onboarding"),
    );
    expect(mocks.savePendingChallengeInvite).toHaveBeenCalledWith(
      "GND-ABCDE",
    );
    expect(
      mocks.savePendingChallengeInvite.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.replace.mock.invocationCallOrder[0]);
  });

  it("일반 화면에서는 챌린지 초대 코드를 저장하지 않는다", () => {
    mocks.getMyProfile.mockReturnValue(new Promise(() => {}));

    render(<OnboardingGate />);

    expect(mocks.savePendingChallengeInvite).not.toHaveBeenCalled();
  });
});
