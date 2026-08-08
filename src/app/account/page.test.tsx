// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  getUserIdentities: vi.fn(),
  linkIdentity: vi.fn(),
}));

// ⚠️ `@/lib/identity`를 목으로 덮지 않는다. 이 화면의 판정(신원 유무 → 로그아웃
//    잠금)이 그 모듈과 맞물려 있어서, 목으로 가리면 **둘이 갈라져도 통과한다.**
//    Supabase 경계만 막고 실제 identity.ts를 태운다.
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: mocks.getUser,
      signOut: mocks.signOut,
      getUserIdentities: mocks.getUserIdentities,
      linkIdentity: mocks.linkIdentity,
    },
  }),
}));

import AccountPage from "./page";

function setAccount({
  email = null,
  identities = [],
}: {
  email?: string | null;
  identities?: string[];
}) {
  mocks.getUser.mockResolvedValue({ data: { user: email ? { email } : {} } });
  mocks.getUserIdentities.mockResolvedValue({
    data: { identities: identities.map((provider) => ({ provider })) },
    error: null,
  });
}

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "kakao,google";
  mocks.linkIdentity.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  cleanup();
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = ORIGINAL_FLAG;
});

describe("계정 화면 — 로그아웃 잠금은 '돌아올 문'이 있는가로 판정한다", () => {
  it("이메일이 붙은 계정에는 로그아웃을 보여준다", async () => {
    setAccount({ email: "me@example.com", identities: ["email"] });
    render(<AccountPage />);

    await screen.findByText("me@example.com");
    expect(screen.getAllByRole("button", { name: "로그아웃" }).length).toBe(1);
  });

  /**
   * ⚠️ 이메일은 붙었는데 `identities`가 비는 계정이 나올 수 있다 —
   * `scripts/link-email-to-account.mjs`가 관리자 API로 이메일만 세팅하는 경로다.
   * 잠금을 신원만으로 판정하면 그 계정은 **영영 로그아웃하지 못한다.**
   * 이메일+비밀번호는 `/login`으로 실제로 돌아올 수 있으므로 문이 맞다.
   */
  it("신원이 0행이라도 이메일이 있으면 로그아웃이 열린다", async () => {
    setAccount({ email: "atty2@naver.com", identities: [] });
    render(<AccountPage />);

    await screen.findByText("atty2@naver.com");
    expect(screen.getAllByRole("button", { name: "로그아웃" }).length).toBe(1);
    expect(screen.getByText(/지켜지고 있어요/)).not.toBeNull();
  });

  /**
   * ⚠️ 이 단언이 2026-08-08 변경의 핵심이다. 잠금 기준이 **이메일 → 신원**으로
   * 바뀌었다. 기준을 이메일로 되돌리면 **카카오만 붙인 사람이 영영 로그아웃하지
   * 못한다** — 이 테스트가 그때 실패한다.
   */
  it("카카오만 붙어 있어도 로그아웃을 보여준다 (이메일이 없어도)", async () => {
    setAccount({ email: null, identities: ["kakao"] });
    render(<AccountPage />);

    await screen.findByText(/지켜지고 있어요/);
    expect(screen.getAllByRole("button", { name: "로그아웃" }).length).toBe(1);
  });

  /**
   * 익명 계정은 이 브라우저 저장소에만 있다. 로그아웃하면 기록·XP·배지로 돌아올
   * 방법이 영영 없다 — 돌아올 문이 없는 사람에게 나가는 문만 주지 않는다.
   */
  it("신원이 하나도 없으면 로그아웃을 보여주지 않는다", async () => {
    setAccount({ email: null, identities: [] });
    render(<AccountPage />);

    await screen.findByText(/이 브라우저에만 있어요/);
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });

  /** 조회가 실패하면 잠긴 채로 둔다 — 못 나가는 것보다 못 돌아오는 쪽이 나쁘다 */
  it("신원 조회가 실패하면 로그아웃을 열지 않는다 (fail-closed)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: {} } });
    mocks.getUserIdentities.mockResolvedValue({
      data: null,
      error: new Error("network down"),
    });
    render(<AccountPage />);

    await screen.findByText(/이 브라우저에만 있어요/);
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });
});

describe("계정 화면 — 신원 연결", () => {
  it("아무것도 안 붙었으면 카카오·구글 버튼이 둘 다 뜬다", async () => {
    setAccount({ email: null, identities: [] });
    render(<AccountPage />);

    await screen.findByRole("button", { name: "카카오로 계정 지키기" });
    expect(
      screen.getByRole("button", { name: "구글로 계정 지키기" }),
    ).not.toBeNull();
  });

  it("이미 붙은 제공자는 버튼이 아니라 '연결됨'으로 나온다", async () => {
    setAccount({ email: null, identities: ["kakao"] });
    render(<AccountPage />);

    await screen.findByRole("button", { name: "구글로 계정 지키기" });
    expect(
      screen.queryByRole("button", { name: "카카오로 계정 지키기" }),
    ).toBeNull();
    expect(screen.getByText("카카오")).not.toBeNull();
  });

  it("누르면 linkIdentity를 부른다 (signInWithOAuth가 아니다)", async () => {
    setAccount({ email: null, identities: [] });
    render(<AccountPage />);

    fireEvent.click(await screen.findByRole("button", { name: "카카오로 계정 지키기" }));

    await waitFor(() => expect(mocks.linkIdentity).toHaveBeenCalledTimes(1));
    expect(mocks.linkIdentity.mock.calls[0][0].provider).toBe("kakao");
  });

  /**
   * ⚠️ 사용자는 **지금 이 계정**을 지키려고 눌렀다. 그 카카오가 이미 다른 GND
   * 계정에 붙어 있으면 이 계정은 여전히 안 지켜진 상태다. "연결 실패"로만 말하면
   * 지켜진 줄 알고 브라우저를 지운다 — 그 순간 기록이 사라진다.
   */
  it("이미 다른 계정에 붙은 신원이면 기록이 안 옮겨진다고 말한다", async () => {
    setAccount({ email: null, identities: [] });
    mocks.linkIdentity.mockResolvedValue({
      data: null,
      error: new Error("identity_already_exists"),
    });
    render(<AccountPage />);

    fireEvent.click(await screen.findByRole("button", { name: "카카오로 계정 지키기" }));

    await screen.findByText(/옮겨지지 않아요/);
    // 실패했으면 여전히 안 지켜진 상태다 — 로그아웃이 열리면 안 된다.
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });

  /**
   * 플래그가 비면 버튼이 하나도 없다(§5.3 설정 전). 그때 아무 말도 없으면
   * "안 지켜졌다"는 경고만 남아 사용자가 할 일을 못 찾는다.
   */
  it("연결 수단이 꺼져 있으면 버튼 대신 이유를 말한다", async () => {
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "";
    setAccount({ email: null, identities: [] });
    render(<AccountPage />);

    await screen.findByText(/연결 수단이 꺼져 있어요/);
    expect(
      screen.queryByRole("button", { name: "카카오로 계정 지키기" }),
    ).toBeNull();
  });
});

describe("계정 화면 — 로그아웃 흐름", () => {
  it("한 번 더 확인받은 뒤에야 실제로 나간다", async () => {
    setAccount({ email: "me@example.com", identities: ["email"] });
    mocks.signOut.mockResolvedValue({ error: null });
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign },
      writable: true,
    });

    render(<AccountPage />);
    await screen.findByText("me@example.com");

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(mocks.signOut).not.toHaveBeenCalled(); // 첫 클릭은 확인 단계일 뿐

    expect(screen.getByRole("button", { name: "취소" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    // 클라이언트 이동을 쓰면 AuthProvider가 세션을 다시 읽지 않는다.
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login"));
  });

  it("취소하면 나가지 않는다", async () => {
    setAccount({ email: "me@example.com", identities: ["email"] });
    render(<AccountPage />);
    await screen.findByText("me@example.com");

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("로그아웃이 실패하면 이동하지 않고 이유를 보여준다", async () => {
    setAccount({ email: "me@example.com", identities: ["email"] });
    mocks.signOut.mockResolvedValue({ error: { message: "network down" } });
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign },
      writable: true,
    });

    render(<AccountPage />);
    await screen.findByText("me@example.com");
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await screen.findByText(/network down/);
    expect(assign).not.toHaveBeenCalled();
  });
});
