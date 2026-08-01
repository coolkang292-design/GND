// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  assign: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getUser: mocks.getUser, signOut: mocks.signOut },
  }),
}));

import AccountPage from "./page";

function withEmail(email: string | null) {
  mocks.getUser.mockResolvedValue({ data: { user: email ? { email } : {} } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("계정 화면 — 로그아웃", () => {
  it("이메일이 붙은 계정에는 로그아웃을 보여준다", async () => {
    withEmail("me@example.com");
    render(<AccountPage />);

    await screen.findByText("me@example.com");
    expect(screen.getAllByRole("button", { name: "로그아웃" }).length).toBe(1);
  });

  // 익명 계정은 이 브라우저 저장소에만 있다. 로그아웃하면 기록·XP·배지로
  // 돌아올 방법이 영영 없다 — 돌아올 문이 없는 사람에게 나가는 문만 주지 않는다.
  it("이메일이 없는 익명 계정에는 로그아웃을 보여주지 않는다", async () => {
    withEmail(null);
    render(<AccountPage />);

    await screen.findByText("아직 연결되지 않음");
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
    expect(screen.getByText(/로그아웃도 막아 뒀어요/)).not.toBeNull();
  });

  it("한 번 더 확인받은 뒤에야 실제로 나간다", async () => {
    withEmail("me@example.com");
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
    withEmail("me@example.com");
    render(<AccountPage />);
    await screen.findByText("me@example.com");

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("로그아웃이 실패하면 이동하지 않고 이유를 보여준다", async () => {
    withEmail("me@example.com");
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
