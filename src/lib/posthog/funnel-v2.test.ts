// @vitest-environment jsdom
/**
 * 퍼널 v2(2026-10-11) — 유입 정규화·첫 방문/재방문·봇 차단·시작 버튼·식별 중복.
 *
 * 목 SDK가 `capture` 순간의 distinct_id를 같이 적는다. "같은 사람의 이벤트가 몇 개의 사람으로
 * 쪼개져 나가는가"를 이걸로 센다 — PostHog의 사용자 수가 부풀지 않는다는 근거가 이것이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
  const calls: string[] = [];
  const captures: Array<{ event: string; props: Record<string, unknown>; distinctId: string }> = [];
  const state = { opted: false, distinctId: "anon-device-1", anonSeq: 1 };
  const fake = {
    init: vi.fn(() => {
      calls.push("init");
    }),
    identify: vi.fn((id: string) => {
      calls.push(`identify:${id}`);
      state.distinctId = id;
    }),
    reset: vi.fn(() => {
      calls.push("reset");
      state.anonSeq += 1;
      state.distinctId = `anon-device-${state.anonSeq}`;
    }),
    opt_out_capturing: vi.fn(() => {
      calls.push("opt_out");
      state.opted = true;
    }),
    opt_in_capturing: vi.fn(() => {
      calls.push("opt_in");
      state.opted = false;
    }),
    has_opted_out_capturing: vi.fn(() => state.opted),
    setPersonProperties: vi.fn(() => {
      calls.push("setPerson");
    }),
    capture: vi.fn((event: string, props: Record<string, unknown>) => {
      calls.push(`capture:${event}`);
      captures.push({ event, props, distinctId: state.distinctId });
    }),
    get_property: vi.fn(() => undefined),
    get_distinct_id: vi.fn(() => state.distinctId),
  };
  return { fake, calls, captures, state };
});

vi.mock("posthog-js", () => ({ default: sdk.fake }));

import { __resetAnalyticsForTests, syncAnalytics } from "./client";
import { NEW_VISIT_WINDOW_MS, TRAFFIC_KEY, trafficType } from "./context";
import { normalizeUtmSource, sanitizeEventProps, START_LOCATIONS } from "./events";
import { isLikelyBot } from "./exclusion";
import { trackProduct } from "./track";
import { installMemoryStorage } from "./test-storage";
import {
  declineOrWithdrawAnalyticsConsent,
  grantAnalyticsConsent,
} from "./consent-actions";

const KEY = "phc_abcdefghij1234567890";
const ANON = "11111111-1111-4111-8111-111111111111"; // 익명으로 시작한 계정(연결 후에도 같은 UID)
const OTHER = "33333333-3333-4333-8333-333333333333"; // /login으로 들어간 다른 계정

const UA = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.30.85 (iPhone15,2; iOS 18_0; ko_KR; ko; scale=3.00; 1179x2556; 642938742)",
  threads:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 350.0.0.30.85 (iPhone15,2; iOS 18_0; ko_KR)",
  kakao:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410520",
  naver:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.4)",
  youtube:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 com.google.android.youtube/19.40.33",
  cubotPhone:
    "Mozilla/5.0 (Linux; Android 12; CUBOT P80) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  headless:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
  googlebot:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  naverYeti: "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
  facebookPreview: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  kakaoScrap: "facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/",
  genericBot: "Mozilla/5.0 (compatible; SomeBot 1.0; +https://example.com/bot)",
  curl: "curl/8.4.0",
};

function configure() {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", KEY);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
}
function setAcquisition(source: string | null, capturedAt: string) {
  window.localStorage.setItem(
    "gnd-acquisition",
    JSON.stringify({ source, medium: null, campaign: null, referrer: null, landing: "/record", capturedAt }),
  );
}
const sync = (userId: string | null, isAnonymous: boolean | null = true) =>
  syncAnalytics({ userId, isAnonymous, pathname: window.location.pathname });

// jsdom의 navigator에는 `webdriver`가 없다. 인스턴스에 덮어씌웠다가 테스트마다 걷는다.
function asBrowser(ua: string, webdriver = false) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, get: () => ua });
  Object.defineProperty(window.navigator, "webdriver", { configurable: true, get: () => webdriver });
}
function restoreBrowser() {
  delete (window.navigator as unknown as Record<string, unknown>).userAgent;
  delete (window.navigator as unknown as Record<string, unknown>).webdriver;
}

beforeEach(() => {
  installMemoryStorage();
  window.history.pushState({}, "", "/onboarding");
  vi.unstubAllEnvs();
  sdk.calls.length = 0;
  sdk.captures.length = 0;
  sdk.state.opted = false;
  sdk.state.distinctId = "anon-device-1";
  sdk.state.anonSeq = 1;
  for (const f of Object.values(sdk.fake)) (f as { mockClear?: () => void }).mockClear?.();
  __resetAnalyticsForTests();
  asBrowser(UA.iphoneSafari);
});
afterEach(() => {
  vi.unstubAllEnvs();
  restoreBrowser();
});

describe("utm_source 정규화 — 원문은 나가지 않는다", () => {
  it.each([
    ["instagram", "instagram"],
    ["Instagram", "instagram"],
    ["ig", "instagram"],
    ["IG", "instagram"],
    ["ig_story", "instagram"],
    ["l.instagram.com", "instagram"],
    ["youtube", "youtube"],
    ["YouTube_shorts", "youtube"],
    ["yt", "youtube"],
    ["youtu.be", "youtube"],
    ["threads", "threads"],
    ["threads.net", "threads"],
    ["tiktok", "tiktok"],
    ["TikTok_ads", "tiktok"],
    ["kakao", "other"],
    ["naver", "other"],
    ["bigbang", "other"], // `ig`가 들어 있어도 정확히 `ig`가 아니면 인스타가 아니다
    ["me@example.com", "other"],
    ["https://evil.example/?token=eyJabc", "other"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeUtmSource(raw)).toBe(expected);
    expect(sanitizeEventProps("landing_opened", { utm_source: raw })).toEqual({ utm_source: expected });
  });

  it("비어 있거나 문자열이 아니면 속성을 싣지 않는다(직접 유입)", () => {
    for (const v of [null, undefined, "", "   ", 3, true]) {
      expect(normalizeUtmSource(v)).toBeNull();
    }
    expect(sanitizeEventProps("onboarding_started", { utm_source: "" })).toEqual({});
  });

  it("모든 제품 이벤트에 첫 접촉 채널이 붙는다 (ig → instagram)", async () => {
    configure();
    setAcquisition("ig", new Date(Date.now() - 60_000).toISOString());
    grantAnalyticsConsent();
    await sync(ANON);
    trackProduct("onboarding_started", {}, { userId: ANON });
    expect(sdk.captures[0]!.props).toMatchObject({ utm_source: "instagram" });
    // 사람 속성(첫 접촉)도 다섯 채널로만
    expect(sdk.fake.identify).toHaveBeenCalledWith(
      ANON,
      expect.anything(),
      expect.objectContaining({ initial_utm_source: "instagram" }),
    );
  });
});

describe("traffic_type — 브라우저 저장소 기준 첫 방문/재방문", () => {
  it("첫 접촉이 방금(30분 안)이면 new, 오래전이면 returning", () => {
    const now = Date.parse("2026-10-11T12:00:00Z");
    setAcquisition("instagram", new Date(now - 5 * 60_000).toISOString());
    expect(trafficType(now)).toBe("new");

    window.sessionStorage.clear();
    setAcquisition("instagram", new Date(now - 3 * 24 * 3600_000).toISOString());
    expect(trafficType(now)).toBe("returning");
  });

  it("한 번 정하면 탭 세션 동안 고정된다 — 첫 방문 중 30분이 넘어도·OAuth 왕복으로 다시 떠도 new", () => {
    const now = Date.parse("2026-10-11T12:00:00Z");
    setAcquisition("instagram", new Date(now - 60_000).toISOString());
    expect(trafficType(now)).toBe("new");
    expect(trafficType(now + NEW_VISIT_WINDOW_MS * 4)).toBe("new");
    expect(window.sessionStorage.getItem(TRAFFIC_KEY)).toBe("new");
  });

  it("유입 기록이 없으면 속성을 빼고 보낸다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(ANON);
    trackProduct("onboarding_started", {}, { userId: ANON });
    expect(sdk.captures[0]!.props).not.toHaveProperty("traffic_type");
    expect(sdk.captures[0]!.props).not.toHaveProperty("utm_source");
  });

  it("동의 전에는 traffic_type을 계산·저장하지 않고, 철회하면 지운다", async () => {
    configure();
    setAcquisition("instagram", new Date().toISOString());
    await sync(ANON);
    trackProduct("onboarding_started", {}, { userId: ANON });
    expect(window.sessionStorage.getItem(TRAFFIC_KEY)).toBeNull();

    grantAnalyticsConsent();
    await sync(ANON);
    trackProduct("onboarding_started", {}, { userId: ANON });
    expect(sdk.captures[0]!.props).toMatchObject({ traffic_type: "new" });
    expect(window.sessionStorage.getItem(TRAFFIC_KEY)).toBe("new");

    declineOrWithdrawAnalyticsConsent();
    expect(window.sessionStorage.getItem(TRAFFIC_KEY)).toBeNull();
  });
});

describe("봇·자동화 — 판정만 하고 UA는 보내지 않는다, 봇이면 전송 차단", () => {
  it.each([
    ["chromeAndroid", false],
    ["iphoneSafari", false],
    ["instagram", false],
    ["threads", false],
    ["kakao", false],
    ["naver", false],
    ["youtube", false],
    ["cubotPhone", false],
    ["headless", true],
    ["googlebot", true],
    ["naverYeti", true],
    ["facebookPreview", true],
    ["kakaoScrap", true],
    ["genericBot", true],
    ["curl", true],
  ] as const)("%s → is_bot=%s", (name, expected) => {
    expect(isLikelyBot({ userAgent: UA[name], webdriver: false })).toBe(expected);
  });

  it("navigator.webdriver=true(Playwright·Selenium)면 UA가 평범해도 봇이다", () => {
    expect(isLikelyBot({ userAgent: UA.chromeAndroid, webdriver: true })).toBe(true);
  });

  it("동의했어도 봇이면 SDK를 띄우지 않고 아무것도 보내지 않는다", async () => {
    configure();
    asBrowser(UA.chromeAndroid, true);
    grantAnalyticsConsent();
    await sync(ANON);
    trackProduct("start_clicked", { location: "onboarding_try_first" }, { userId: ANON });
    expect(sdk.fake.init).not.toHaveBeenCalled();
    expect(sdk.fake.capture).not.toHaveBeenCalled();
  });

  it("사람 브라우저에서 보낸 이벤트에는 UA 원문이나 is_bot이 실리지 않는다", async () => {
    configure();
    asBrowser(UA.instagram);
    grantAnalyticsConsent();
    await sync(ANON);
    trackProduct("start_clicked", { location: "onboarding_try_first", user_agent: UA.instagram, is_bot: false }, { userId: ANON });
    expect(sdk.captures).toHaveLength(1);
    const wire = JSON.stringify(sdk.captures);
    expect(wire).not.toMatch(/Instagram 350|iPhone15|is_bot|user_agent/);
  });
});

describe("start_clicked", () => {
  it("location은 정해 둔 값만 — 그 밖의 값은 버린다", () => {
    for (const loc of START_LOCATIONS) {
      expect(sanitizeEventProps("start_clicked", { location: loc })).toEqual({ location: loc });
    }
    expect(sanitizeEventProps("start_clicked", { location: "home_banner" })).toEqual({});
    expect(sanitizeEventProps("start_clicked", { location: "/onboarding?x=1" })).toEqual({});
  });

  it("같은 버튼은 탭 세션당 한 번, 다른 버튼은 따로 센다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(ANON);
    const click = (location: string) =>
      trackProduct("start_clicked", { location }, { userId: ANON, dedupe: { key: `start_clicked:${location}`, scope: "session" } });
    click("onboarding_try_first");
    click("onboarding_try_first");
    click("onboarding_kakao");
    expect(sdk.captures.map((c) => c.props.location)).toEqual(["onboarding_try_first", "onboarding_kakao"]);
  });
});

describe("식별 중복 — distinct_id = auth.uid", () => {
  it("익명 → 바로 시작 → 첫 운동 → 기록 지키기(linkIdentity): UID가 같으니 사람은 1명, reset·재식별 없음", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(ANON, true);
    trackProduct("start_clicked", { location: "onboarding_try_first" }, { userId: ANON });
    trackProduct("onboarding_completed", { has_invite: false }, { userId: ANON, dedupe: { key: `onboarding_completed:${ANON}`, scope: "persistent" } });
    trackProduct("workout_started", { is_first: true, workout_index: 1 }, { userId: ANON });
    trackProduct("workout_completed", { is_first: true, workout_index: 1 }, { userId: ANON });
    trackProduct("identity_link_started", { provider: "kakao", location: "protect_records" }, { userId: ANON });

    // 카카오에서 돌아옴: /auth/callback이 전체 페이지 로드 → 같은 UID, is_anonymous=false
    await sync(ANON, false);
    trackProduct("identity_link_succeeded", { provider: "kakao" }, { userId: ANON, dedupe: { key: `identity_link_succeeded:${ANON}`, scope: "persistent" } });

    expect(sdk.fake.reset).not.toHaveBeenCalled();
    expect(sdk.fake.identify).toHaveBeenCalledTimes(1);
    expect(sdk.fake.setPersonProperties).toHaveBeenCalledWith({ is_anonymous: false, is_internal: false });
    const people = new Set(sdk.captures.map((c) => c.distinctId));
    expect([...people]).toEqual([ANON]);
    expect(sdk.captures.map((c) => c.event)).toEqual([
      "start_clicked",
      "onboarding_completed",
      "workout_started",
      "workout_completed",
      "identity_link_started",
      "identity_link_succeeded",
    ]);
  });

  it("/login으로 다른 계정에 들어가면 reset 후 새 id — 이전 익명 id를 합치지 않고, 앞 사람 이벤트를 새 사람 이름으로 보내지 않는다", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(ANON, true);
    trackProduct("onboarding_started", {}, { userId: ANON });
    // 식별 전환 사이에 들어온 앞 사람(ANON)의 이벤트
    const switching = sync(OTHER, false);
    trackProduct("onboarding_completed", { has_invite: false }, { userId: ANON });
    await switching;
    trackProduct("login_succeeded", { provider: "password" }, { userId: OTHER });

    expect(sdk.calls.filter((c) => c === "reset" || c.startsWith("identify:"))).toEqual([
      `identify:${ANON}`,
      "reset",
      `identify:${OTHER}`,
    ]);
    // alias/merge 호출이 없다 — 두 사람은 PostHog에서 따로 센다
    expect(sdk.calls.some((c) => /alias|merge/.test(c))).toBe(false);
    // 새 사람(OTHER) 이름으로 나간 것은 그 사람의 이벤트뿐이다. 앞 사람 것은 앞 사람 이름이거나 버려진다.
    expect(sdk.captures.filter((c) => c.distinctId === OTHER).map((c) => c.event)).toEqual([
      "login_succeeded",
    ]);
    for (const c of sdk.captures.filter((x) => x.event !== "login_succeeded")) {
      expect(c.distinctId).toBe(ANON);
    }
  });

  it("같은 탭에서 온보딩 완료 화면이 다시 떠도(새로고침·재시도) onboarding_completed는 한 번", async () => {
    configure();
    grantAnalyticsConsent();
    await sync(ANON);
    for (let i = 0; i < 3; i++) {
      trackProduct("onboarding_completed", { has_invite: false }, { userId: ANON, dedupe: { key: `onboarding_completed:${ANON}`, scope: "persistent" } });
    }
    expect(sdk.captures.filter((c) => c.event === "onboarding_completed")).toHaveLength(1);
  });
});
