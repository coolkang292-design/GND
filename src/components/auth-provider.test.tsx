// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import { AuthProvider, useAuth } from "./auth-provider";

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseBrowserClient: vi.fn(),
}));

type AuthChangeHandler = (
  event: string,
  session: { user: { id: string } } | null,
) => void;

type FakeAuth = {
  getSession: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  signInAnonymously: ReturnType<typeof vi.fn>;
  onAuthStateChange: ReturnType<typeof vi.fn>;
};

/** 마지막으로 등록된 onAuthStateChange 콜백 — 테스트에서 직접 쏘기 위해 붙든다 */
let emitAuthChange: AuthChangeHandler = () => {};

function stubSupabase(overrides: Partial<FakeAuth> = {}): FakeAuth {
  const auth: FakeAuth = {
    getSession: vi.fn(async () => ({ data: { session: null } })),
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    signInAnonymously: vi.fn(async () => ({
      data: { user: { id: "fresh-anon-id" } },
      error: null,
    })),
    onAuthStateChange: vi.fn((handler: AuthChangeHandler) => {
      emitAuthChange = handler;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    ...overrides,
  };
  vi.mocked(getSupabaseBrowserClient).mockReturnValue(
    { auth } as unknown as ReturnType<typeof getSupabaseBrowserClient>,
  );
  return auth;
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs in anonymously when there is no session", async () => {
    const auth = stubSupabase();

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
    expect(result.current.userId).toBe("fresh-anon-id");
    expect(result.current.error).toBeNull();
  });

  it("keeps a session whose user still exists on the server", async () => {
    const auth = stubSupabase({
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "existing-id" } } },
      })),
      getUser: vi.fn(async () => ({
        data: { user: { id: "existing-id" } },
        error: null,
      })),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userId).toBe("existing-id");
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("discards a ghost session for a deleted user and signs in fresh", async () => {
    const auth = stubSupabase({
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "deleted-id" } } },
      })),
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: { status: 403, message: "User from sub claim does not exist" },
      })),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
    expect(result.current.userId).toBe("fresh-anon-id");
    expect(result.current.error).toBeNull();
  });

  it("keeps the local session when the server check fails for other reasons", async () => {
    const auth = stubSupabase({
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "offline-id" } } },
      })),
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: { status: 500, message: "fetch failed" },
      })),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userId).toBe("offline-id");
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
});

describe("AuthProvider — 로그인으로 계정이 바뀔 때", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 이 구독이 없으면 /login에서 로그인해도 provider가 이전 익명 userId를
  // 계속 들고 있어, 화면이 남의 빈 계정을 조회하고 온보딩으로 튕긴다.
  it("SIGNED_IN 이벤트가 오면 userId를 새 계정으로 바꾼다", async () => {
    stubSupabase();
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userId).toBe("fresh-anon-id");

    act(() => {
      emitAuthChange("SIGNED_IN", { user: { id: "real-account-id" } });
    });

    await waitFor(() => expect(result.current.userId).toBe("real-account-id"));
    expect(result.current.loading).toBe(false);
  });

  it("같은 계정 이벤트가 반복돼도 상태를 흔들지 않는다", async () => {
    stubSupabase();
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = result.current;

    act(() => {
      emitAuthChange("TOKEN_REFRESHED", { user: { id: "fresh-anon-id" } });
    });

    expect(result.current).toBe(before);
  });
});
