// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import { AuthProvider, useAuth } from "./auth-provider";

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseBrowserClient: vi.fn(),
}));

type FakeAuth = {
  getSession: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  signInAnonymously: ReturnType<typeof vi.fn>;
};

function stubSupabase(overrides: Partial<FakeAuth> = {}): FakeAuth {
  const auth: FakeAuth = {
    getSession: vi.fn(async () => ({ data: { session: null } })),
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    signInAnonymously: vi.fn(async () => ({
      data: { user: { id: "fresh-anon-id" } },
      error: null,
    })),
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
