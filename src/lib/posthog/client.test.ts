// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
  const calls: string[] = [];
  const state = { opted: false, distinctId: "anon-1", identified: false };
  const fake = {
    init: vi.fn((...args: [string, Record<string, unknown>]) => {
      void args;
      calls.push("init");
    }),
    identify: vi.fn((id: string) => {
      calls.push(`identify:${id}`);
      state.distinctId = id;
      state.identified = true;
    }),
    reset: vi.fn(() => {
      calls.push("reset");
      state.distinctId = "anon-2";
      state.identified = false;
    }),
    opt_out_capturing: vi.fn(() => {
      calls.push("opt_out");
      state.opted = true;
    }),
    opt_in_capturing: vi.fn((...args: unknown[]) => {
      void args;
      calls.push("opt_in");
      state.opted = false;
    }),
    has_opted_out_capturing: vi.fn(() => state.opted),
    setPersonProperties: vi.fn(() => {
      calls.push("setPerson");
    }),
    capture: vi.fn((e: string) => {
      calls.push(`capture:${e}`);
    }),
    get_property: vi.fn((k: string) => (k === "$user_state" ? (state.identified ? "identified" : "anonymous") : undefined)),
    get_distinct_id: vi.fn(() => state.distinctId),
  };
  return { fake, calls, state };
});

vi.mock("posthog-js", () => ({ default: sdk.fake }));

import {
  __analyticsStateForTests,
  __resetAnalyticsForTests,
  syncAnalytics,
} from "./client";
import { CONSENT_KEY } from "./consent";
import { INTERNAL_FLAG_KEY } from "./exclusion";
import { trackProduct } from "./track";
import { installMemoryStorage } from "./test-storage";
import {
  declineOrWithdrawAnalyticsConsent,
  grantAnalyticsConsent,
} from "./consent-actions";

const KEY = "phc_abcdefghij1234567890";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function configure() {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", KEY);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
}
function goTo(path: string) {
  window.history.pushState({}, "", path);
}
const sync = (userId: string | null, isAnonymous: boolean | null = true) =>
  syncAnalytics({ userId, isAnonymous, pathname: window.location.pathname });

beforeEach(() => {
  installMemoryStorage();
  goTo("/record");
  vi.unstubAllEnvs();
  sdk.calls.length = 0;
  sdk.state.opted = false;
  sdk.state.distinctId = "anon-1";
  sdk.state.identified = false;
  for (const f of Object.values(sdk.fake)) (f as { mockClear?: () => void }).mockClear?.();
  __resetAnalyticsForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("동의 전 / 거부 / 키 없음 — 아무것도 하지 않는다", () => {
  it("동의 전(unset): SDK를 불러오지도 초기화하지도 않고, 이벤트·저장 데이터가 없다", async () => {
    configure();
    await sync(A);
    trackProduct("landing_opened", { utm_source: "ig" }, { userId: A, dedupe: { key: "landing_opened", scope: "session" } });
    expect(sdk.fake.init).not.toHaveBeenCalled();
    expect(sdk.fake.capture).not.toHaveBeenCalled();
    expect(__analyticsStateForTests().loaded).toBe(false);
    // 우리 쪽 중복 방지 기록도 동의 전에는 만들지 않는다
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("거부(denied): 마찬가지로 아무것도 안 한다", async () => {
    configure();
    declineOrWithdrawAnalyticsConsent();
    await sync(A);
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.init).not.toHaveBeenCalled();
    expect(sdk.fake.capture).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(CONSENT_KEY)!).status).toBe("denied");
  });

  it("동의했어도 키가 없으면 전송을 중단한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    grantAnalyticsConsent();
    await sync(A);
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.init).not.toHaveBeenCalled();
    expect(sdk.fake.capture).not.toHaveBeenCalled();
  });

  it("동의했어도 호스트가 US가 아니면(오설정) 보내지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    grantAnalyticsConsent();
    await sync(A);
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.init).not.toHaveBeenCalled();
  });

  it("옛 버전 동의 기록은 무효(unset)로 본다", async () => {
    configure();
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 0, status: "granted" }));
    await sync(A);
    expect(sdk.fake.init).not.toHaveBeenCalled();
  });
});

describe("동의 후", () => {
  it("SDK를 안전한 설정으로 초기화하고 Supabase id로 식별한다", async () => {
    configure();
    window.localStorage.setItem(
      "gnd-acquisition",
      JSON.stringify({ source: "instagram", medium: "creator", campaign: "pilot01", referrer: null, landing: "/", capturedAt: "2026-10-09T00:00:00Z" }),
    );
    grantAnalyticsConsent();
    await sync(A, true);

    expect(sdk.fake.init).toHaveBeenCalledTimes(1);
    const [key, cfg] = sdk.fake.init.mock.calls[0]!;
    expect(key).toBe(KEY);
    expect(cfg).toMatchObject({
      api_host: "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      rageclick: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      person_profiles: "identified_only",
      persistence: "localStorage",
      ip: false,
      save_referrer: false,
      save_campaign_params: false,
    });
    expect(typeof (cfg as { before_send: unknown }).before_send).toBe("function");

    expect(sdk.fake.identify).toHaveBeenCalledWith(
      A,
      { is_anonymous: true },
      { initial_utm_source: "instagram", initial_utm_medium: "creator", initial_utm_campaign: "pilot01" },
    );
  });

  it("이벤트는 화이트리스트 속성만 싣는다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A);
    trackProduct(
      "login_failed",
      { provider: "google", error_code: "network", email: "a@b.com", detail: "raw error text" },
      { userId: A },
    );
    expect(sdk.fake.capture).toHaveBeenCalledWith("login_failed", { provider: "google", error_code: "network" });
  });

  it("준비 전에 들어온 이벤트는 식별 뒤에 정확히 한 번 나간다", async () => {
    configure();
    grantAnalyticsConsent();
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.capture).not.toHaveBeenCalled();
    await sync(A);
    expect(sdk.fake.capture).toHaveBeenCalledTimes(1);
    expect(sdk.calls.indexOf(`identify:${A}`)).toBeLessThan(sdk.calls.indexOf("capture:onboarding_started"));
    await sync(A); // 같은 상태로 다시 동기화해도 재전송 없음
    expect(sdk.fake.capture).toHaveBeenCalledTimes(1);
    expect(sdk.fake.identify).toHaveBeenCalledTimes(1);
  });

  it("session dedupe: 같은 이벤트는 탭 세션당 한 번만", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A);
    const d = { key: "landing_opened", scope: "session" as const };
    trackProduct("landing_opened", {}, { userId: A, dedupe: d });
    trackProduct("landing_opened", {}, { userId: A, dedupe: d });
    expect(sdk.fake.capture).toHaveBeenCalledTimes(1);
  });

  it("persistent dedupe: 같은 운동 완료는 다시 보내지 않는다 (재시도·새로고침)", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A);
    const d = { key: "workout_completed:sess-1", scope: "persistent" as const };
    trackProduct("workout_completed", { is_first: true, workout_index: 1 }, { userId: A, dedupe: d });
    trackProduct("workout_completed", { is_first: true, workout_index: 1 }, { userId: A, dedupe: d });
    trackProduct("workout_completed", { is_first: false, workout_index: 2 }, { userId: A, dedupe: { key: "workout_completed:sess-2", scope: "persistent" } });
    expect(sdk.fake.capture).toHaveBeenCalledTimes(2);
  });

  it("SDK가 던져도 호출한 쪽은 영향이 없다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A);
    sdk.fake.capture.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => trackProduct("onboarding_started", {}, { userId: A })).not.toThrow();
  });
});

describe("사용자 식별 충돌", () => {
  it("A→B로 바뀌면 reset 뒤에 B를 식별한다 (A를 B에 붙이지 않는다)", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A, true);
    await sync(B, false);
    const i = sdk.calls.indexOf(`identify:${A}`);
    const r = sdk.calls.indexOf("reset");
    const j = sdk.calls.indexOf(`identify:${B}`);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(r).toBeGreaterThan(i);
    expect(j).toBeGreaterThan(r);
    expect(__analyticsStateForTests().identifiedId).toBe(B);
  });

  it("로그아웃(null)이면 reset 하고 식별을 비운다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A);
    await sync(null, null);
    expect(sdk.calls.at(-1)).toBe("reset");
    expect(__analyticsStateForTests().identifiedId).toBeNull();
  });

  it("다른 사용자의 이벤트는 현재 식별된 사람 이름으로 나가지 않는다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A);
    // 옛 클로저가 A로 만든 이벤트가 B로 바뀐 뒤에 도착하는 상황
    await sync(B);
    sdk.fake.capture.mockClear();
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.capture).not.toHaveBeenCalled(); // 붙들림
    await sync(B); // 다음 동기화에서도 A의 이벤트는 B에게 가지 않고 버려진다
    expect(sdk.fake.capture).not.toHaveBeenCalled();
    expect(__analyticsStateForTests().queued).toBe(0);
  });

  it("새로고침으로 저장소에 남은 이전 사용자(A)와 현재(B)가 다르면 reset 한다", async () => {
    configure();
    grantAnalyticsConsent();
    sdk.state.identified = true;
    sdk.state.distinctId = A; // 이전 방문에서 A로 식별된 채 남은 SDK 저장소
    window.localStorage.setItem("gnd:ph:identified", A);
    await sync(B);
    expect(sdk.calls.indexOf("reset")).toBeLessThan(sdk.calls.indexOf(`identify:${B}`));
  });

  it("같은 사용자가 다시 로드되면 식별을 반복하지 않는다", async () => {
    configure();
    grantAnalyticsConsent();
    sdk.state.identified = true;
    sdk.state.distinctId = A;
    window.localStorage.setItem("gnd:ph:identified", A);
    await sync(A);
    expect(sdk.fake.reset).not.toHaveBeenCalled();
    expect(sdk.fake.identify).not.toHaveBeenCalled();
  });

  it("표식이 없으면(저장소 정리 등) 안전하게 다시 식별한다", async () => {
    configure();
    grantAnalyticsConsent();
    sdk.state.identified = true;
    sdk.state.distinctId = A;
    await sync(A);
    expect(sdk.fake.identify).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("gnd:ph:identified")).toBe(A);
  });

  it("표식과 SDK의 id가 다르면 표식을 믿지 않는다", async () => {
    configure();
    grantAnalyticsConsent();
    sdk.state.distinctId = "someone-else";
    window.localStorage.setItem("gnd:ph:identified", A);
    await sync(A);
    expect(sdk.fake.identify).toHaveBeenCalledWith(A, expect.anything(), expect.anything());
  });

  it("철회하면 식별 표식도 지운다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A);
    expect(window.localStorage.getItem("gnd:ph:identified")).toBe(A);
    declineOrWithdrawAnalyticsConsent();
    expect(window.localStorage.getItem("gnd:ph:identified")).toBeNull();
  });

  it("is_anonymous가 true→false로 바뀌면 사람 속성만 갱신한다 (id 불변 = 승격)", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A, true);
    await sync(A, false);
    expect(sdk.fake.reset).not.toHaveBeenCalled();
    expect(sdk.fake.identify).toHaveBeenCalledTimes(1);
    expect(sdk.fake.setPersonProperties).toHaveBeenCalledWith({ is_anonymous: false });
  });
});

describe("철회", () => {
  it("reset 다음에 opt-out 하고, SDK 저장 데이터와 중복 방지 기록을 지우고, 이후 전송을 막는다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A);
    trackProduct("workout_completed", {}, { userId: A, dedupe: { key: "workout_completed:s1", scope: "persistent" } });
    window.localStorage.setItem("ph_phc_abc_posthog", "{}");
    window.localStorage.setItem("__ph_opt_in_out_phc_abc", "0");
    window.sessionStorage.setItem("ph_session", "x");
    sdk.fake.capture.mockClear();

    declineOrWithdrawAnalyticsConsent();

    expect(sdk.calls.indexOf("reset")).toBeGreaterThan(-1);
    expect(sdk.calls.indexOf("opt_out")).toBeGreaterThan(sdk.calls.lastIndexOf(`identify:${A}`));
    expect(sdk.calls.lastIndexOf("reset")).toBeLessThan(sdk.calls.lastIndexOf("opt_out"));
    expect(JSON.parse(window.localStorage.getItem(CONSENT_KEY)!).status).toBe("denied");
    expect(window.localStorage.getItem("ph_phc_abc_posthog")).toBeNull();
    expect(window.localStorage.getItem("__ph_opt_in_out_phc_abc")).toBeNull();
    expect(window.sessionStorage.getItem("ph_session")).toBeNull();
    expect(window.localStorage.getItem("gnd:ph:sent")).toBeNull();

    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.capture).not.toHaveBeenCalled();
    expect(__analyticsStateForTests().identifiedId).toBeNull();
  });

  it("철회 뒤에 다시 동의하면 reset → opt-in → 새로 식별한다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A);
    declineOrWithdrawAnalyticsConsent();
    sdk.calls.length = 0;
    grantAnalyticsConsent();
    await sync(A);
    expect(sdk.calls.slice(0, 3)).toEqual(["reset", "opt_in", `identify:${A}`]);
    sdk.fake.capture.mockClear();
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.capture).toHaveBeenCalledTimes(1);
  });

  it("철회해도 동의 기록 외의 앱 저장소는 건드리지 않는다", async () => {
    configure();
    window.localStorage.setItem("gnd-acquisition", "keep");
    window.localStorage.setItem("sb-auth-token", "keep");
    grantAnalyticsConsent();
    await sync(A);
    declineOrWithdrawAnalyticsConsent();
    expect(window.localStorage.getItem("gnd-acquisition")).toBe("keep");
    expect(window.localStorage.getItem("sb-auth-token")).toBe("keep");
  });
});

describe("제외 대상", () => {
  it("/admin 경로에서는 보내지 않는다", async () => {
    configure();
    grantAnalyticsConsent();
    goTo("/admin/dashboard");
    await sync(A);
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.init).not.toHaveBeenCalled();
    expect(sdk.fake.capture).not.toHaveBeenCalled();
  });

  it("/admin으로 들어오면 걷어내고, 나오면 다시 켠다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(A);
    goTo("/admin");
    await sync(A);
    expect(sdk.calls).toContain("opt_out");
    sdk.fake.capture.mockClear();
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.capture).not.toHaveBeenCalled();
    goTo("/record");
    await sync(A);
    expect(sdk.calls).toContain("opt_in");
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.capture).toHaveBeenCalledTimes(1);
  });

  it("내부 테스트 브라우저 표시가 있으면 보내지 않는다", async () => {
    configure();
    grantAnalyticsConsent();
    window.localStorage.setItem(INTERNAL_FLAG_KEY, "1");
    await sync(A);
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.init).not.toHaveBeenCalled();
    expect(sdk.fake.capture).not.toHaveBeenCalled();
  });

  it("지정한 내부 테스트 계정은 보내지 않는다 (대소문자 무관)", async () => {
    configure();
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_EXCLUDE_USER_IDS", ` ${B.toUpperCase()} , other `);
    grantAnalyticsConsent();
    await sync(B);
    trackProduct("onboarding_started", {}, { userId: B });
    expect(sdk.fake.init).not.toHaveBeenCalled();
    expect(sdk.fake.capture).not.toHaveBeenCalled();
    // 다른 계정은 정상
    await sync(A);
    trackProduct("onboarding_started", {}, { userId: A });
    expect(sdk.fake.capture).toHaveBeenCalledTimes(1);
  });
});
