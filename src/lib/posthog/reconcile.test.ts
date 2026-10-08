// @vitest-environment jsdom
/**
 * Supabase 기록 ↔ PostHog 전송 대조.
 *
 * `recordFunnelEvent` 한 곳에서 두 군데로 나가므로, 같은 호출이 DB에는 몇 건, PostHog에는 몇 건
 * 나가는지를 상태별로 못 박는다. (원본은 DB다 — 숫자가 다르면 DB가 맞다.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryStorage } from "./test-storage";

const h = vi.hoisted(() => {
  const inserts: Array<Record<string, unknown>> = [];
  const captures: Array<{ event: string; props: Record<string, unknown> }> = [];
  const state = { dbError: null as null | { code: string }, opted: false, distinctId: "anon", identified: false };
  const sdk = {
    init: vi.fn(),
    identify: vi.fn((id: string) => {
      state.distinctId = id;
      state.identified = true;
    }),
    reset: vi.fn(),
    opt_out_capturing: vi.fn(() => {
      state.opted = true;
    }),
    opt_in_capturing: vi.fn(() => {
      state.opted = false;
    }),
    has_opted_out_capturing: vi.fn(() => state.opted),
    setPersonProperties: vi.fn(),
    capture: vi.fn((event: string, props: Record<string, unknown>) => {
      captures.push({ event, props });
    }),
    get_property: vi.fn(() => undefined),
    get_distinct_id: vi.fn(() => state.distinctId),
  };
  return { inserts, captures, state, sdk };
});

vi.mock("posthog-js", () => ({ default: h.sdk }));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseBrowserClient: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        h.inserts.push(row);
        return { error: h.state.dbError };
      },
    }),
  }),
}));

const KEY = "phc_abcdefghij1234567890";
const U = "11111111-1111-4111-8111-111111111111";

let recordFunnelEvent: typeof import("@/lib/analytics-events").recordFunnelEvent;
let FUNNEL_EVENTS: typeof import("@/lib/analytics-events").FUNNEL_EVENTS;
let syncAnalytics: typeof import("./client").syncAnalytics;
let grantAnalyticsConsent: typeof import("./consent-actions").grantAnalyticsConsent;
let declineOrWithdrawAnalyticsConsent: typeof import("./consent-actions").declineOrWithdrawAnalyticsConsent;

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", KEY);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
  installMemoryStorage();
  window.history.pushState({}, "", "/record");
  h.inserts.length = 0;
  h.captures.length = 0;
  h.state.dbError = null;
  h.state.opted = false;
  h.state.distinctId = "anon";
  h.state.identified = false;
  for (const f of Object.values(h.sdk)) (f as { mockClear?: () => void }).mockClear?.();
  ({ recordFunnelEvent, FUNNEL_EVENTS } = await import("@/lib/analytics-events"));
  ({ syncAnalytics } = await import("./client"));
  ({ grantAnalyticsConsent, declineOrWithdrawAnalyticsConsent } = await import("./consent-actions"));
});

const sync = () => syncAnalytics({ userId: U, isAnonymous: true, pathname: "/record" });

describe("DB ↔ PostHog 대조", () => {
  it("동의한 사용자: 기존 9종 이벤트가 DB에 1건, PostHog에 1건씩 — 중복·누락 없음", async () => {
    grantAnalyticsConsent();
    await sync();
    for (const e of FUNNEL_EVENTS) {
      await recordFunnelEvent(e, U, e === "identity_link_failed" ? "network" : undefined, {
        provider: "kakao",
      });
    }
    expect(h.inserts.map((r) => r.event_name)).toEqual([...FUNNEL_EVENTS]);
    expect(h.captures.map((c) => c.event)).toEqual([...FUNNEL_EVENTS]);
    // 속성: 실패 이벤트에만 error_code, 시작·실패에만 provider
    const failed = h.captures.find((c) => c.event === "identity_link_failed")!;
    expect(failed.props).toEqual({ provider: "kakao", error_code: "network" });
    const started = h.captures.find((c) => c.event === "identity_link_started")!;
    expect(started.props).toEqual({ provider: "kakao" });
    expect(h.captures.find((c) => c.event === "onboarding_started")!.props).toEqual({});
  });

  it("같은 세션에서 같은 이벤트를 반복 호출해도 DB 1건, PostHog 1건", async () => {
    grantAnalyticsConsent();
    await sync();
    await recordFunnelEvent("challenge_viewed", U);
    await recordFunnelEvent("challenge_viewed", U);
    await recordFunnelEvent("challenge_viewed", U);
    expect(h.inserts).toHaveLength(1);
    expect(h.captures.filter((c) => c.event === "challenge_viewed")).toHaveLength(1);
  });

  it("DB가 중복(23505)으로 거절해도 PostHog 전송은 영향이 없고 한 번만 나간다", async () => {
    grantAnalyticsConsent();
    await sync();
    h.state.dbError = { code: "23505" };
    await recordFunnelEvent("landing_opened", U);
    await recordFunnelEvent("landing_opened", U);
    expect(h.captures.filter((c) => c.event === "landing_opened")).toHaveLength(1);
  });

  it("landing_opened는 첫 접촉 유입값을 DB와 PostHog에 같은 값으로 싣는다", async () => {
    window.localStorage.setItem(
      "gnd-acquisition",
      JSON.stringify({ source: "instagram", medium: "creator", campaign: "pilot01", referrer: "l.instagram.com", landing: "/invite/:code", capturedAt: "2026-10-09T00:00:00Z" }),
    );
    grantAnalyticsConsent();
    await sync();
    await recordFunnelEvent("landing_opened", U);
    expect(h.inserts[0]).toMatchObject({ source: "instagram", medium: "creator", campaign: "pilot01" });
    expect(h.captures.find((c) => c.event === "landing_opened")!.props).toEqual({
      utm_source: "instagram",
      utm_medium: "creator",
      utm_campaign: "pilot01",
      referrer_host: "l.instagram.com",
      landing_path: "/invite/:code",
    });
  });

  it("동의하지 않은 사용자: DB 기록은 그대로(기존 기능), PostHog는 0건", async () => {
    await sync();
    await recordFunnelEvent("onboarding_started", U);
    await recordFunnelEvent("identity_link_started", U, undefined, { provider: "google" });
    expect(h.inserts).toHaveLength(2);
    expect(h.captures).toHaveLength(0);
    expect(h.sdk.init).not.toHaveBeenCalled();
  });

  it("거부·철회한 사용자도 DB 기록은 그대로, PostHog는 0건", async () => {
    grantAnalyticsConsent();
    await sync();
    await recordFunnelEvent("onboarding_started", U);
    declineOrWithdrawAnalyticsConsent();
    await recordFunnelEvent("challenge_viewed", U);
    expect(h.inserts.map((r) => r.event_name)).toEqual(["onboarding_started", "challenge_viewed"]);
    expect(h.captures.map((c) => c.event)).toEqual(["onboarding_started"]);
  });

  it("키가 없으면 DB는 그대로, PostHog 호출은 전혀 없다", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    grantAnalyticsConsent();
    await sync();
    await recordFunnelEvent("onboarding_started", U);
    expect(h.inserts).toHaveLength(1);
    expect(h.sdk.init).not.toHaveBeenCalled();
    expect(h.captures).toHaveLength(0);
  });

  it("PostHog 쪽에서 예외가 나도 DB 기록은 성공한다", async () => {
    grantAnalyticsConsent();
    await sync();
    h.sdk.capture.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(recordFunnelEvent("onboarding_started", U)).resolves.toBe(true);
    expect(h.inserts).toHaveLength(1);
  });

  it("DB 기록이 불가능한 환경(익명 id 없음)에서는 PostHog도 보내지 않는다", async () => {
    grantAnalyticsConsent();
    await sync();
    await recordFunnelEvent("onboarding_started", null);
    expect(h.inserts).toHaveLength(0);
    expect(h.captures).toHaveLength(0);
  });
});
