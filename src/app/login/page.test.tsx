// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  linkIdentity: vi.fn(),
}));

// identity.ts를 목으로 덮지 않는다 — 이 화면이 **어느 쪽 API를 부르는가**가
// 검사 대상이라, 그 모듈을 가리면 뒤바꿔도 통과한다.
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signInWithOAuth: mocks.signInWithOAuth,
      linkIdentity: mocks.linkIdentity,
    },
  }),
}));

import LoginPage from "./page";

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "kakao,google";
  mocks.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  cleanup();
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = ORIGINAL_FLAG;
});

describe("로그인 화면", () => {
  it("켜져 있는 제공자 버튼이 뜬다", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "카카오로 로그인" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "구글로 로그인" })).not.toBeNull();
  });

  /**
   * ⚠️⚠️ 이 화면**만** `signInWithOAuth`가 맞다. `AuthProvider`가 `/login`에서는
   * 익명 세션을 발급하지 않으므로(`auth-provider.tsx:94`) 붙일 세션이 없다.
   * 반대로 여기서 `linkIdentity`를 쓰면 세션이 없어 그냥 실패한다.
   */
  it("signInWithOAuth를 부른다 — linkIdentity가 아니다", async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "카카오로 로그인" }));

    await waitFor(() => expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1));
    expect(mocks.signInWithOAuth.mock.calls[0][0].provider).toBe("kakao");
    expect(mocks.linkIdentity).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 이메일 폼을 지우지 마라(설계 §5.6). 카카오·구글이 둘 다 없는 사용자의
   * 탈출구이고, 이미 이메일로 붙은 계정이 실제로 있다.
   */
  it("제공자 버튼이 있어도 이메일 폼은 남아 있다", () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText("you@example.com")).not.toBeNull();
    expect(screen.getByRole("button", { name: "로그인" })).not.toBeNull();
  });

  it("플래그가 비면 제공자 버튼이 사라지고 이메일 폼만 남는다", () => {
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "";
    render(<LoginPage />);
    expect(screen.queryByRole("button", { name: "카카오로 로그인" })).toBeNull();
    expect(screen.getByPlaceholderText("you@example.com")).not.toBeNull();
  });

  it("제공자 로그인이 실패하면 이유를 보여준다", async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: null,
      error: new Error("provider is not enabled"),
    });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "구글로 로그인" }));

    await screen.findByText(/지금은 이 방법으로 연결할 수 없어요/);
  });
});
