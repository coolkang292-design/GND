// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/auth/callback` — 카카오·구글 가입/연결이 **전부 지나가는 단 하나의 길목**인데
 * 2026-08-09까지 테스트가 0건이었다.
 *
 * ⚠️ 이 화면은 개발 서버에서 확인하기가 구조적으로 어렵다. 착지 주소가
 * `window.location.origin` 기반(`identity.ts:53`)이라 localhost로 돌아오는데,
 * Supabase Redirect URL 허용목록은 **밖에서 판정할 수 없다**(실측:
 * `/auth/v1/authorize`는 허용 여부와 무관하게 302를 준다). 즉 눌러 봐야 아는
 * 화면이다 — 그래서 더더욱 단위 테스트가 있어야 한다.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getMyProfile: vi.fn(),
  peekPendingChallengeInvite: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: mocks.getSession,
      getUser: mocks.getUser,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  }),
}));
vi.mock("@/lib/crew", () => ({ getMyProfile: mocks.getMyProfile }));
vi.mock("@/lib/challenge", () => ({
  peekPendingChallengeInvite: mocks.peekPendingChallengeInvite,
}));
// identityError는 목으로 덮지 않는다 — "원인을 말하는가"가 검사 대상이라,
// 그 모듈을 가리면 문구를 뭉개도 통과한다.

import AuthCallbackPage from "./page";

const assign = vi.fn();

/** 주소창을 갈아끼운다. jsdom의 location은 assign이 없어서 통째로 덮는다. */
function setUrl(search: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { search, pathname: "/auth/callback", assign },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.getMyProfile.mockResolvedValue(null);
  mocks.peekPendingChallengeInvite.mockReturnValue(null);
  setUrl("");
});

afterEach(cleanup);

describe("/auth/callback — 갈라 보내기", () => {
  it("프로필이 없으면 온보딩으로 보낸다 (닉네임을 마저 받아야 한다)", async () => {
    mocks.getMyProfile.mockResolvedValue(null);
    render(<AuthCallbackPage />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/onboarding"));
  });

  it("프로필이 있으면 계정 화면으로 보낸다", async () => {
    mocks.getMyProfile.mockResolvedValue({ id: "u1", nickname: "나" });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/account"));
  });

  /**
   * ⚠️ 초대 링크를 탭한 사람을 `/account`로 보내면 "내가 왜 여기 있지"가 되고
   * 초대는 조용히 사라진다. 보관된 코드가 있으면 그쪽이 먼저다.
   */
  it("프로필이 있어도 챌린지 초대가 기다리면 그 챌린지로 보낸다", async () => {
    mocks.getMyProfile.mockResolvedValue({ id: "u1", nickname: "나" });
    mocks.peekPendingChallengeInvite.mockReturnValue("GND-ABCDE");
    render(<AuthCallbackPage />);
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/challenge?join=GND-ABCDE"),
    );
  });

  it("프로필 조회가 실패하면 온보딩으로 보낸다 (계정 화면에 가두지 않는다)", async () => {
    mocks.getMyProfile.mockRejectedValue(new Error("network"));
    render(<AuthCallbackPage />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/onboarding"));
  });
});

describe("/auth/callback — 코드 교환", () => {
  /**
   * ⚠️ `@supabase/ssr`의 `createBrowserClient`는 `detectSessionInUrl`이 켜져 있어
   * `?code=`를 **스스로 교환한다.** 세션이 이미 있는데 또 교환하면 "이미 쓴 코드"로
   * 실패한다. 이 단언을 지우면 그 회귀가 조용히 돌아온다.
   */
  it("세션이 이미 있으면 다시 교환하지 않는다", async () => {
    setUrl("?code=abc");
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("세션이 없고 code가 있으면 우리가 교환한다", async () => {
    setUrl("?code=abc");
    render(<AuthCallbackPage />);
    await waitFor(() =>
      expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc"),
    );
  });

  it("교환에 실패하면 이동하지 않고 이유를 남긴다", async () => {
    setUrl("?code=abc");
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "invalid grant" },
    });
    render(<AuthCallbackPage />);
    await waitFor(() =>
      expect(screen.getByText(/연결을 마치지 못했어요/)).not.toBeNull(),
    );
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("/auth/callback — 오류를 삼키지 않는다", () => {
  /**
   * ⚠️⚠️ 2026-08-08에 `error`를 전부 "취소"로 뭉갰다가 실제로 이 응답을 삼켰다.
   * 사용자는 계정을 지키려고 눌렀는데 아무 말 없이 제자리로 돌아왔고, 지켜진
   * 줄 알고 브라우저를 지우면 그 순간 기록이 사라진다.
   */
  it("identity_already_exists면 원인을 말한다 — 기록이 안 옮겨진다는 것까지", async () => {
    setUrl(
      "?error=server_error&error_code=identity_already_exists" +
        "&error_description=Identity+is+already+linked+to+another+user",
    );
    render(<AuthCallbackPage />);
    await waitFor(() =>
      expect(screen.getByText(/이미 다른 GND 계정에 연결/)).not.toBeNull(),
    );
    expect(screen.getByText(/기록은 옮겨지지 않아요/)).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("사용자가 취소(access_denied)하면 조용히 돌려보낸다", async () => {
    setUrl("?error=access_denied&error_description=User+denied");
    render(<AuthCallbackPage />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/onboarding"));
  });
});

describe("/auth/callback — 오류 화면에 가두지 않는다", () => {
  /**
   * ⚠️⚠️ 이게 이 파일의 핵심선이다. 옛 코드는 탈출구가 `/account` **한 곳**이었다.
   * 초대 링크로 처음 온 사람이 `identity_already_exists`를 맞으면 프로필이 없는
   * 채로 계정 화면에 앉는데, 거기는 `(tabs)` 밖이라 `OnboardingGate`가 없고
   * 신원이 0개라 로그아웃 버튼도 안 그려진다(`account/page.tsx:83` fail-closed).
   * **나갈 문이 없다.** 온보딩에서 고친 D2와 같은 함정이 옆 파일에 남아 있었다.
   */
  it("프로필이 없으면 탈출구가 가입 화면이다 (계정 화면이 아니다)", async () => {
    mocks.getMyProfile.mockResolvedValue(null);
    setUrl("?error=server_error&error_code=identity_already_exists");
    render(<AuthCallbackPage />);

    const link = await screen.findByRole("link", {
      name: "가입 화면으로 돌아가기",
    });
    expect(link.getAttribute("href")).toBe("/onboarding");
    expect(screen.queryByRole("link", { name: "계정 화면으로 돌아가기" })).toBeNull();
  });

  it("프로필이 있으면 탈출구가 계정 화면이다", async () => {
    mocks.getMyProfile.mockResolvedValue({ id: "u1", nickname: "나" });
    setUrl("?error=server_error&error_code=identity_already_exists");
    render(<AuthCallbackPage />);

    const link = await screen.findByRole("link", {
      name: "계정 화면으로 돌아가기",
    });
    expect(link.getAttribute("href")).toBe("/account");
  });
});
