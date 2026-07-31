import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, proxy } from "./proxy";

const { createServerClientMock, getUserMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

type SupabaseCookieAdapter = {
  cookies: {
    setAll: (
      cookies: Array<{
        name: string;
        value: string;
        options?: {
          httpOnly?: boolean;
          path?: string;
          sameSite?: "lax" | "strict" | "none";
        };
      }>,
    ) => void;
  };
};

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("유효한 관리자 키를 쿠키로 옮기고 key 없는 /admin으로 리다이렉트한다", async () => {
    vi.stubEnv("ADMIN_ACCESS_KEY", "test-secret");
    const request = new NextRequest(
      "http://localhost/admin?key=test-secret",
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/admin");
    expect(response.cookies.get(ADMIN_COOKIE)).toMatchObject({
      value: "test-secret",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/admin",
      maxAge: 60 * 60 * 24 * 180,
    });
  });

  it("잘못된 관리자 키는 key 없는 /admin으로 리다이렉트하되 쿠키를 만들지 않는다", async () => {
    vi.stubEnv("ADMIN_ACCESS_KEY", "test-secret");
    const request = new NextRequest(
      "http://localhost/admin?key=wrong-secret",
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/admin");
    expect(response.cookies.get(ADMIN_COOKIE)).toBeUndefined();
  });

  it("key가 없으면 Supabase 세션을 갱신하고 새 쿠키를 응답에 싣는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    createServerClientMock.mockImplementationOnce(
      (
        _url: string,
        _anonKey: string,
        adapter: SupabaseCookieAdapter,
      ) => {
        getUserMock.mockImplementationOnce(async () => {
          adapter.cookies.setAll([
            {
              name: "sb-session",
              value: "refreshed-session",
              options: {
                httpOnly: true,
                path: "/",
                sameSite: "lax",
              },
            },
          ]);
          return { data: { user: null }, error: null };
        });

        return { auth: { getUser: getUserMock } };
      },
    );
    const request = new NextRequest("http://localhost/admin");

    const response = await proxy(request);

    expect(createServerClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      }),
    );
    expect(getUserMock).toHaveBeenCalledOnce();
    expect(response.cookies.get("sb-session")).toMatchObject({
      value: "refreshed-session",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });
  });
});
