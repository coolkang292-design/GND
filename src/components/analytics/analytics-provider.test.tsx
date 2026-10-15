// @vitest-environment jsdom
/**
 * `AnalyticsProvider` — 로그인 확인 중(`loading`)의 `userId=null`을 로그아웃으로 넘기지 않는가.
 *
 * 2026-10-11 로컬 브라우저(가짜 수집 서버)에서 새로고침마다 `$identify`가 다시 나가는 것을 보고 잡았다.
 * 원인: 첫 렌더의 `userId=null, loading=true` → `client.ts`가 reset → 곧이어 같은 사람 재식별.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { installMemoryStorage } from "@/lib/posthog/test-storage";

const h = vi.hoisted(() => ({
  auth: { userId: null as string | null, loading: true, configured: true },
  sync: vi.fn(async (input: unknown) => {
    void input;
  }),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/record" }));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => h.auth }));
vi.mock("@/lib/posthog/client", () => ({ syncAnalytics: h.sync }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: () => false }));

import { AnalyticsProvider } from "./analytics-provider";

const A = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  installMemoryStorage();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_abcdefghij1234567890");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
  h.sync.mockClear();
  h.auth = { userId: null, loading: true, configured: true };
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const userIds = () => h.sync.mock.calls.map((c) => (c[0] as { userId: string | null }).userId);

describe("AnalyticsProvider", () => {
  it("로그인 확인 중에는 동기화하지 않고, 확인이 끝나면 그 사람으로 한 번 맞춘다", () => {
    const { rerender } = render(<AnalyticsProvider />);
    expect(h.sync).not.toHaveBeenCalled(); // null을 '로그아웃'으로 보내지 않는다

    h.auth = { userId: A, loading: false, configured: true };
    rerender(<AnalyticsProvider />);
    expect(userIds()).toEqual([A]);
  });

  it("진짜 로그아웃(loading=false, userId=null)은 그대로 넘긴다 — 그래야 reset된다", () => {
    h.auth = { userId: A, loading: false, configured: true };
    const { rerender } = render(<AnalyticsProvider />);
    h.auth = { userId: null, loading: false, configured: true };
    rerender(<AnalyticsProvider />);
    expect(userIds()).toEqual([A, null]);
  });

  it("키가 없으면 아무것도 하지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    h.auth = { userId: A, loading: false, configured: true };
    render(<AnalyticsProvider />);
    expect(h.sync).not.toHaveBeenCalled();
  });
});
