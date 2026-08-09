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

  /**
   * ⚠️⚠️ D6 (2026-08-09). `getMyProfile`은 오류를 던지는데(`crew.ts:12`) 옛 코드는
   * 그 호출을 `try` **밖**에 뒀다. 그러면 네트워크가 한 번 흔들렸을 때
   * `void run()`이 rejection을 삼키고 화면이 **`친구를 맺는 중…`에서 영원히
   * 멈춘다** — 오류도, 재시도도, 나갈 문도 없다.
   *
   * 이 단언이 재는 것은 "오류 문구가 뜨는가"가 아니라 **"멈추지 않는가"** 다.
   * 그래서 `친구를 맺는 중…`이 사라졌는지까지 본다.
   */
  it("프로필 조회가 실패해도 멈추지 않고 이유와 나갈 문을 준다", async () => {
    mocks.getMyProfile.mockRejectedValue(new Error("network down"));
    renderInvite("GND-7FDVC");

    await screen.findByText(/연결이 불안정해요/);
    expect(screen.queryByText("친구를 맺는 중…")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.redeemInviteCode).not.toHaveBeenCalled();
  });

  /**
   * ⚠️⚠️ D7 (2026-08-09). 이 화면은 오류를 네 가지나 그리면서 **링크가 0개**였다.
   * PWA로 홈 화면에서 열면 주소창이 없어 나갈 수단이 아예 사라진다.
   * `ScreenError`를 쓰는 이유가 이것이다 — 문구를 그리면 문이 딸려 온다.
   */
  it.each([
    ["self_invite", "self_invite"],
    ["없는 코드", "invalid_invite_code"],
  ])("오류 화면(%s)에는 나갈 문이 있다", async (_label, reason) => {
    mocks.redeemInviteCode.mockRejectedValue(new Error(reason));
    renderInvite("GND-7FDVC");

    const link = await screen.findByRole("link", { name: "홈으로 가기" });
    expect(link.getAttribute("href")).toBe("/home");
  });
});
