// @vitest-environment jsdom

import { Suspense } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  getMyProfile: vi.fn(),
  redeemInviteCode: vi.fn(),
  savePendingInvite: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    userId: "me",
    loading: false,
    configured: true,
  }),
}));

vi.mock("@/lib/crew", () => ({
  getMyProfile: mocks.getMyProfile,
  redeemInviteCode: mocks.redeemInviteCode,
  savePendingInvite: mocks.savePendingInvite,
}));

import InvitePage from "./page";

/**
 * Next 16은 `params`를 Promise로 주고 페이지가 `use()`로 푼다.
 *
 * 테스트에서는 **이미 이행된 thenable**을 넘긴다. React의 `use`는 `status`가
 * `fulfilled`면 서스펜드 없이 값을 바로 읽으므로, 서스펜스 재시도 타이밍에
 * 기대지 않고 첫 렌더에서 코드가 확정된다.
 */
function resolvedParams(code: string) {
  const value = { code };
  return Object.assign(Promise.resolve(value), {
    status: "fulfilled" as const,
    value,
  });
}

function renderInvite(code: string) {
  return render(
    <Suspense fallback={null}>
      <InvitePage params={resolvedParams(code)} />
    </Suspense>,
  );
}

describe("/invite/[code]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMyProfile.mockResolvedValue({ id: "me", nickname: "나" });
    mocks.redeemInviteCode.mockResolvedValue({
      kind: "friend",
      nickname: "낭만송곳니",
      alreadyFriends: false,
    });
  });

  afterEach(() => cleanup());

  /**
   * ⚠️ 프로필이 없는 사람에게 redeem을 걸면 안 된다 — 서버가 닉네임 없는 행을
   * 친구 목록에 넣게 되고, 그 사람은 온보딩도 못 밟는다. 코드는 보관만 하고
   * 온보딩이 프로필을 만든 **뒤에** 쓴다.
   */
  it("프로필이 없으면 코드를 보관하고 온보딩으로 보낸다", async () => {
    mocks.getMyProfile.mockResolvedValue(null);
    renderInvite("gnd-7fdvc");

    await waitFor(() =>
      expect(mocks.savePendingInvite).toHaveBeenCalledWith("GND-7FDVC"),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
    expect(mocks.redeemInviteCode).not.toHaveBeenCalled();
  });

  it("프로필이 있으면 코드를 정규화해 redeem하고 홈으로 보낸다", async () => {
    renderInvite("gnd-7fdvc");

    await waitFor(() =>
      expect(mocks.redeemInviteCode).toHaveBeenCalledWith("GND-7FDVC"),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/home");
  });

  /**
   * ⚠️ 자기 링크를 누른 경우를 "존재하지 않는 코드"로 뭉개면, 사용자가 링크가
   * 깨진 줄 알고 새로 만들려 한다(코드는 멱등이라 새로 안 생긴다).
   */
  it("자기 링크를 누르면 그렇다고 말한다", async () => {
    mocks.redeemInviteCode.mockRejectedValue(new Error("self_invite"));
    renderInvite("GND-7FDVC");

    await screen.findByText("내 초대 링크예요. 친구에게 보내 주세요 🙂");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("없는 코드는 링크가 잘못됐다고 말한다", async () => {
    mocks.redeemInviteCode.mockRejectedValue(new Error("invalid_invite_code"));
    renderInvite("GND-XXXXX");

    await screen.findByText("존재하지 않는 초대 링크예요");
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
