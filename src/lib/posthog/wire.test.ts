// @vitest-environment jsdom
/**
 * **진짜 posthog-js**를 jsdom에서 돌리고, 네트워크로 **실제로 나간 바이트**를 검사한다.
 * (목 SDK 테스트는 "우리가 무엇을 호출하는가"를, 이 테스트는 "무엇이 선 위로 나가는가"를 본다.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gunzipSync } from "node:zlib";
import { installMemoryStorage } from "./test-storage";

// posthog-js는 모듈 싱글턴이다. 테스트마다 모듈을 새로 불러 SDK 상태가 새는 것을 막는다.
let syncAnalytics: typeof import("./client").syncAnalytics;
let trackProduct: typeof import("./track").trackProduct;
let grantAnalyticsConsent: typeof import("./consent-actions").grantAnalyticsConsent;
let declineOrWithdrawAnalyticsConsent: typeof import("./consent-actions").declineOrWithdrawAnalyticsConsent;

const KEY = "phc_wiretest0123456789";
const HOST = "http://127.0.0.1:8099";
const A = "11111111-1111-4111-8111-111111111111";

interface Sent {
  url: string;
  events: Record<string, unknown>[];
}
const sent: Sent[] = [];
const urls: string[] = [];

async function toBytes(body: unknown): Promise<Buffer | null> {
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (typeof Blob !== "undefined" && body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  if (body instanceof URLSearchParams) return Buffer.from(body.toString(), "utf8");
  return null;
}

async function decode(body: unknown): Promise<Record<string, unknown>[]> {
  const bytes = await toBytes(body);
  if (!bytes) return [];
  let buf = bytes;
  try {
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
    let text = buf.toString("utf8");
    if (text.startsWith("data=")) {
      text = Buffer.from(decodeURIComponent(text.slice(5)), "base64").toString("utf8");
    }
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    const obj = parsed as { batch?: unknown[] };
    if (Array.isArray(obj.batch)) return obj.batch as Record<string, unknown>[];
    return [parsed as Record<string, unknown>];
  } catch {
    return [];
  }
}

async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 15));
}

beforeEach(async () => {
  vi.resetModules();
  // posthog-js가 window에 남기는 전역 — 남아 있으면 다음 테스트의 init이 no-op이 된다
  for (const k of ["posthog", "__PosthogExtensions__"]) delete (window as unknown as Record<string, unknown>)[k];
  installMemoryStorage();
  sent.length = 0;
  urls.length = 0;
  ({ syncAnalytics } = await import("./client"));
  ({ trackProduct } = await import("./track"));
  ({ grantAnalyticsConsent, declineOrWithdrawAnalyticsConsent } = await import("./consent-actions"));
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", KEY);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", HOST);
  window.history.pushState(
    {},
    "",
    "/invite/GND-7K2QP?utm_source=instagram&email=secret@example.com",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: unknown }) => {
      urls.push(String(url));
      sent.push({ url: String(url), events: await decode(init?.body) });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: vi.fn((url: string) => {
      urls.push(String(url));
      return true;
    }),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const allEvents = () => sent.flatMap((s) => s.events);

describe("선 위로 나가는 데이터 (진짜 SDK)", () => {
  it("동의 전: 네트워크 요청 0, PostHog 저장 데이터 0", async () => {
    await syncAnalytics({ userId: A, isAnonymous: true, pathname: window.location.pathname });
    trackProduct("landing_opened", { utm_source: "instagram" }, { userId: A });
    await settle();
    expect(urls).toEqual([]);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });

  it("동의 후: 허용된 이벤트·속성만 나가고, URL·초대 코드·이메일·IP는 나가지 않는다", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: A, isAnonymous: true, pathname: window.location.pathname });
    trackProduct(
      "landing_opened",
      {
        utm_source: "instagram",
        utm_medium: "creator",
        referrer_host: "l.instagram.com",
        landing_path: "/invite/:code",
        email: "secret@example.com",
      },
      { userId: A },
    );
    trackProduct("onboarding_completed", { has_invite: true, nickname: "철수" }, { userId: A });
    await settle();

    const events = allEvents();
    const names = events.map((e) => e.event);
    expect(names).toContain("landing_opened");
    expect(names).toContain("onboarding_completed");
    // 자동 이벤트(옵트인, 페이지뷰 등)는 하나도 없다
    for (const n of names) {
      expect(["$identify", "$set", "landing_opened", "onboarding_completed"]).toContain(n);
    }

    const wire = JSON.stringify(sent);
    expect(wire).not.toMatch(/secret@example\.com/);
    expect(wire).not.toMatch(/GND-7K2QP/);
    expect(wire).not.toMatch(/철수/);
    expect(wire).not.toMatch(/\$current_url|\$pathname|\$referrer|\$initial_|\$ip"/);
    // 식별은 Supabase id로, 이벤트에는 GeoIP 비활성 표시
    const landing = events.find((e) => e.event === "landing_opened")!;
    const props = landing.properties as Record<string, unknown>;
    expect(props.distinct_id).toBe(A);
    expect(props.$geoip_disable).toBe(true);
    expect(props.utm_source).toBe("instagram");
    expect(props.landing_path).toBe("/invite/:code");
    expect(props).not.toHaveProperty("email");

    // 자동 수집·리플레이·플래그 요청 없음
    for (const u of urls) {
      expect(u).not.toMatch(/\/s\/|\/flags|\/decide|recorder|surveys/);
    }
  });

  it("철회 후: 더 이상 나가지 않고 PostHog 저장 데이터가 지워진다", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: A, isAnonymous: true, pathname: window.location.pathname });
    trackProduct("onboarding_started", {}, { userId: A });
    await settle();
    expect(allEvents().some((e) => e.event === "onboarding_started")).toBe(true);

    declineOrWithdrawAnalyticsConsent();
    await settle();
    const before = urls.length;
    trackProduct("onboarding_completed", { has_invite: false }, { userId: A });
    trackProduct("workout_completed", { is_first: true }, { userId: A });
    await settle();
    expect(urls.length).toBe(before);
    expect(allEvents().some((e) => e.event === "workout_completed")).toBe(false);

    const leftovers: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)!;
      if (/ph_|posthog/i.test(k)) leftovers.push(k);
    }
    expect(leftovers).toEqual([]);
  });
});
