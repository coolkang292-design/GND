// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import { AuthProvider, useAuth } from "./auth-provider";

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseBrowserClient: vi.fn(),
}));

const nav = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
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
    nav.pathname = "/home";
  });

  // 로그아웃의 핵심 보증. 이게 없으면 로그아웃 직후 provider가 곧바로 새 익명
  // 계정을 만들어 ① 사용자는 로그아웃이 아니라 **다른 사람**이 되고
  // ② 로그아웃할 때마다 운영 DB에 프로필 없는 유령 계정이 쌓인다.
  it("never issues an anonymous account on the login screen", async () => {
    nav.pathname = "/login";
    const auth = stubSupabase();

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    expect(result.current.userId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  /**
   * ⚠️⚠️ 제공자에서 돌아오는 중에는 세션이 **아직 없는 것이 정상**이다.
   * 여기서 익명 계정을 발급하면 코드 교환이 실패한 순간(만료·재사용·PKCE
   * verifier 없음) 사용자가 조용히 새 익명 계정이 되고, 더 나쁘게는
   * `/auth/callback`의 `if (!session && code)` 가드가 **그 익명 세션을 보고
   * 교환을 통째로 건너뛴다** — 구글로 로그인했는데 빈 계정으로 온보딩에 떨어져
   * 원래 기록과 갈린다. `signInWithOAuth`/`linkIdentity`를 뒤바꿨을 때와 같은
   * 종류의 사고인데 조용해서 더 위험하다.
   */
  it("never issues an anonymous account on the auth callback", async () => {
    nav.pathname = "/auth/callback";
    const auth = stubSupabase();

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    expect(result.current.userId).toBeNull();
  });

  it("still shows an existing session on the login screen", async () => {
    nav.pathname = "/login";
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
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
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

/**
 * **설치본(홈 화면 앱)의 첫 실행** — 계정 분리를 막는 안전핀.
 *
 * ⚠️ iOS는 홈 화면 앱과 사파리의 저장소가 갈려서, 사파리에서 로그인해 두고
 *    설치해도 설치본은 **세션 없이** 처음 열린다. 여기서 익명 계정을 발급하면
 *    그 사람은 새 사람이 되고 온보딩으로 밀려나 `identity_already_exists`
 *    막다른 길에 앉는다. 그래서 `/login`으로 보낸다.
 */
describe("AuthProvider — 설치본 첫 실행", () => {
  const assign = vi.fn();
  let realLocation: Location;

  function setStandalone(on: boolean) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (q: string) => ({
        matches: on && q.includes("standalone"),
        media: q,
      }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    nav.pathname = "/record";
    realLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { pathname: "/record", search: "", assign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
    setStandalone(false);
  });

  it("⚠️ 설치본에서 세션이 없으면 익명 계정을 만들지 않고 /login으로 보낸다", async () => {
    setStandalone(true);
    const auth = stubSupabase();

    renderHook(() => useAuth(), { wrapper });

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/login?from=installed"),
    );
    // 이게 핵심이다 — 발급됐다면 그 사람은 이미 남이 됐다
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("설치본이라도 세션이 있으면 그대로 쓴다 — 안드로이드는 로그인이 유지된다", async () => {
    setStandalone(true);
    const auth = stubSupabase({
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "kept-id" } } },
      })),
      getUser: vi.fn(async () => ({
        data: { user: { id: "kept-id" } },
        error: null,
      })),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.userId).toBe("kept-id"));
    expect(assign).not.toHaveBeenCalled();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("⚠️ /onboarding은 예외 — 여기서도 되돌리면 두 화면이 서로를 가리키며 갇힌다", async () => {
    setStandalone(true);
    nav.pathname = "/onboarding";
    const auth = stubSupabase();

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(assign).not.toHaveBeenCalled();
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it("브라우저 탭(설치본 아님)에서는 예전처럼 익명 계정을 발급한다", async () => {
    setStandalone(false);
    const auth = stubSupabase();

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(assign).not.toHaveBeenCalled();
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
    expect(result.current.userId).toBe("fresh-anon-id");
  });
});
