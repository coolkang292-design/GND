import { afterEach, describe, expect, it, vi } from "vitest";
import { isAnalyticsConfigured, posthogHost, posthogKey, POSTHOG_US_HOST } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PostHog 설정 (fail-closed)", () => {
  it("키가 없으면 꺼진다", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    expect(posthogKey()).toBeNull();
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it("프로젝트 키(phc_)만 받는다 — 비밀키·잘못된 값은 거부", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phx_secretpersonalapikey123");
    expect(posthogKey()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_short");
    expect(posthogKey()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_abcdefghij1234567890");
    expect(posthogKey()).toBe("phc_abcdefghij1234567890");
  });

  it("호스트 기본값은 US Cloud", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_abcdefghij1234567890");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    expect(posthogHost()).toBe(POSTHOG_US_HOST);
    expect(isAnalyticsConfigured()).toBe(true);
  });

  it("US 이외의 호스트(EU 등)는 받지 않고 분석을 끈다", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_abcdefghij1234567890");
    for (const h of ["https://eu.i.posthog.com", "https://evil.example.com", "http://us.i.posthog.com", "not a url"]) {
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", h);
      expect(posthogHost()).toBeNull();
      expect(isAnalyticsConfigured()).toBe(false);
    }
  });

  it("로컬 테스트용 loopback 호스트는 허용한다", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_abcdefghij1234567890");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "http://127.0.0.1:8099/");
    expect(posthogHost()).toBe("http://127.0.0.1:8099");
  });
});
