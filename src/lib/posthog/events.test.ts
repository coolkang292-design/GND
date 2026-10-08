import { describe, expect, it } from "vitest";
import type { CaptureResult } from "posthog-js";
import {
  PRODUCT_EVENTS,
  durationBucket,
  sanitizeEventProps,
  sanitizeOutgoing,
  sanitizePersonProps,
} from "./events";

function cr(event: string, properties: Record<string, unknown>, extra: Partial<CaptureResult> = {}) {
  return { uuid: "u", event, properties, ...extra } as CaptureResult;
}

describe("sanitizeEventProps — 화이트리스트", () => {
  it("허용된 키만 남기고 나머지는 버린다", () => {
    expect(
      sanitizeEventProps("landing_opened", {
        utm_source: "instagram",
        utm_medium: "creator",
        utm_campaign: "influencer_a_pilot01",
        referrer_host: "l.instagram.com",
        landing_path: "/invite/:code",
        email: "a@b.com",
        nickname: "철수",
      }),
    ).toEqual({
      utm_source: "instagram",
      utm_medium: "creator",
      utm_campaign: "influencer_a_pilot01",
      referrer_host: "l.instagram.com",
      landing_path: "/invite/:code",
    });
  });

  it("이메일·URL·JWT 모양의 값은 허용된 키에서도 버린다", () => {
    const out = sanitizeEventProps("landing_opened", {
      utm_source: "me@example.com",
      utm_medium: "https://x.com/a?b=c",
      utm_campaign: "eyJhbGciOiJIUzI1NiJ9.payload.sig",
      referrer_host: "https://google.com/search?q=secret",
      landing_path: "/invite/GND-7K2QP?by=abc",
    });
    expect(out).toEqual({});
  });

  it("공백이 든 캠페인 이름은 밑줄로 정규화하고 64자로 자른다", () => {
    expect(sanitizeEventProps("landing_opened", { utm_campaign: "pilot  one" })).toEqual({
      utm_campaign: "pilot_one",
    });
    const long = sanitizeEventProps("landing_opened", { utm_campaign: "a".repeat(200) });
    expect((long.utm_campaign as string).length).toBe(64);
  });

  it("enum은 허용 값만, 숫자는 범위 안의 정수만", () => {
    expect(sanitizeEventProps("login_failed", { provider: "password", error_code: "network" })).toEqual({
      provider: "password",
      error_code: "network",
    });
    expect(sanitizeEventProps("login_failed", { provider: "naver" })).toEqual({});
    expect(sanitizeEventProps("identity_link_started", { provider: "password" })).toEqual({});
    expect(
      sanitizeEventProps("workout_completed", {
        is_first: true,
        workout_index: 3,
        exercise_count: 5,
        duration_bucket: "20-40",
        has_photo: false,
        exercise_names: ["스쿼트"],
        weight: 100,
        session_id: "abc",
      }),
    ).toEqual({
      is_first: true,
      workout_index: 3,
      exercise_count: 5,
      duration_bucket: "20-40",
      has_photo: false,
    });
    expect(sanitizeEventProps("workout_completed", { workout_index: 0, exercise_count: 1.5 })).toEqual({});
    expect(sanitizeEventProps("workout_completed", { is_first: "true" })).toEqual({});
  });

  it("속성이 없는 이벤트는 무엇을 넘겨도 빈 객체", () => {
    expect(sanitizeEventProps("onboarding_started", { anything: 1, email: "a@b.c" })).toEqual({});
  });

  it("사람 속성도 화이트리스트다", () => {
    expect(
      sanitizePersonProps({
        is_anonymous: false,
        initial_utm_source: "kakao",
        email: "a@b.com",
        nickname: "x",
      }),
    ).toEqual({ is_anonymous: false, initial_utm_source: "kakao" });
  });
});

describe("durationBucket", () => {
  it("구간으로만 낸다", () => {
    expect(durationBucket(null)).toBe("unknown");
    expect(durationBucket(-1)).toBe("unknown");
    expect(durationBucket(5)).toBe("lt10");
    expect(durationBucket(10)).toBe("10-20");
    expect(durationBucket(39)).toBe("20-40");
    expect(durationBucket(59)).toBe("40-60");
    expect(durationBucket(89)).toBe("60-90");
    expect(durationBucket(120)).toBe("gte90");
  });
});

describe("sanitizeOutgoing — SDK before_send", () => {
  it("모르는 이벤트는 전부 버린다 (자동 수집 이벤트 포함)", () => {
    for (const e of ["$pageview", "$pageleave", "$autocapture", "$exception", "$opt_in", "$feature_flag_called", "custom_thing"]) {
      expect(sanitizeOutgoing(cr(e, { $current_url: "https://x/y?z=1" }))).toBeNull();
    }
    expect(sanitizeOutgoing(null)).toBeNull();
  });

  it("전체 URL·referrer·초기값 등 자동 속성을 제거하고 안전한 것만 남긴다", () => {
    const out = sanitizeOutgoing(
      cr("landing_opened", {
        token: "phc_x",
        distinct_id: "user-1",
        $current_url: "https://gnd-one.vercel.app/invite/GND-7K2QP?utm_source=ig&email=a@b.com",
        $pathname: "/invite/GND-7K2QP",
        $host: "gnd-one.vercel.app",
        $referrer: "https://google.com/search?q=secret",
        $referring_domain: "google.com",
        $initial_referrer: "https://x.com/",
        $initial_current_url: "https://gnd-one.vercel.app/?a=b",
        $ip: "1.2.3.4",
        $browser: "Chrome",
        $os: "Android",
        $session_id: "s1",
        $lib: "web",
        utm_source: "instagram",
        email: "a@b.com",
      }),
    );
    expect(out).not.toBeNull();
    const p = out!.properties as Record<string, unknown>;
    expect(p).toMatchObject({
      token: "phc_x",
      distinct_id: "user-1",
      $browser: "Chrome",
      $os: "Android",
      $session_id: "s1",
      $lib: "web",
      utm_source: "instagram",
      $geoip_disable: true,
    });
    for (const banned of ["$current_url", "$pathname", "$host", "$referrer", "$referring_domain", "$initial_referrer", "$initial_current_url", "$ip", "email"]) {
      expect(p).not.toHaveProperty(banned);
    }
    expect(JSON.stringify(out)).not.toMatch(/@|GND-7K2QP|secret|1\.2\.3\.4/);
  });

  it("$identify는 허용하되 사람 속성을 화이트리스트로 거른다", () => {
    const out = sanitizeOutgoing(
      cr(
        "$identify",
        { distinct_id: "u1", $anon_distinct_id: "anon-1", $set: { is_anonymous: true, email: "a@b.com" } },
        { $set: { is_anonymous: true, name: "철수" }, $set_once: { initial_utm_source: "ig", phone: "010" } },
      ),
    );
    expect(out).not.toBeNull();
    expect(out!.$set).toEqual({ is_anonymous: true });
    expect(out!.$set_once).toEqual({ initial_utm_source: "ig" });
    expect((out!.properties as Record<string, unknown>).$set).toEqual({ is_anonymous: true });
    expect((out!.properties as Record<string, unknown>).$anon_distinct_id).toBe("anon-1");
  });

  it("모든 제품 이벤트는 통과한다", () => {
    for (const e of PRODUCT_EVENTS) {
      expect(sanitizeOutgoing(cr(e, { distinct_id: "u" }))).not.toBeNull();
    }
  });
});
