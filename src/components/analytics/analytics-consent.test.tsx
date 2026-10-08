// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { installMemoryStorage } from "@/lib/posthog/test-storage";
import { CONSENT_KEY } from "@/lib/posthog/consent";

let pathname = "/record";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const KEY = "phc_abcdefghij1234567890";

beforeEach(() => {
  installMemoryStorage();
  pathname = "/record";
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", KEY);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const status = () => {
  const raw = window.localStorage.getItem(CONSENT_KEY);
  return raw ? (JSON.parse(raw) as { status: string }).status : null;
};

describe("분석 동의 배너", () => {
  it("키가 없으면 아무것도 그리지 않는다 (기존 화면 그대로)", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { AnalyticsConsentBanner } = await import("./analytics-consent-banner");
    const { container } = render(<AnalyticsConsentBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("아직 고르지 않았으면 동의·거부가 같은 비중으로 뜨고, 거부해도 닫힌다", async () => {
    const { AnalyticsConsentBanner } = await import("./analytics-consent-banner");
    const { container } = render(<AnalyticsConsentBanner />);
    const accept = screen.getByRole("button", { name: "동의" });
    const decline = screen.getByRole("button", { name: "거부" });
    expect(accept.className).toBe(decline.className); // 한쪽을 부각하지 않는다
    expect(status()).toBeNull(); // 기본값은 "수집 안 함"
    fireEvent.click(decline);
    expect(status()).toBe("denied");
    expect(container.querySelector("[role=dialog]")).toBeNull();
  });

  it("동의를 누르면 granted로 저장되고 닫힌다", async () => {
    const { AnalyticsConsentBanner } = await import("./analytics-consent-banner");
    const { container } = render(<AnalyticsConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "동의" }));
    expect(status()).toBe("granted");
    expect(container.querySelector("[role=dialog]")).toBeNull();
  });

  it("이미 고른 사람과 관리자 화면에서는 뜨지 않는다", async () => {
    const { AnalyticsConsentBanner } = await import("./analytics-consent-banner");
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 1, status: "denied", at: "x" }));
    const a = render(<AnalyticsConsentBanner />);
    expect(a.container.querySelector("[role=dialog]")).toBeNull();
    cleanup();
    window.localStorage.clear();
    pathname = "/admin";
    const b = render(<AnalyticsConsentBanner />);
    expect(b.container.querySelector("[role=dialog]")).toBeNull();
  });
});

describe("계정 화면의 철회 설정", () => {
  it("키가 없으면 그리지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { AnalyticsConsentSetting } = await import("./analytics-consent-setting");
    const { container } = render(<AnalyticsConsentSetting />);
    expect(container.innerHTML).toBe("");
  });

  it("켜기 → 끄기(철회) 토글이 상태를 바꾼다", async () => {
    const { AnalyticsConsentSetting } = await import("./analytics-consent-setting");
    render(<AnalyticsConsentSetting />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(status()).toBe("granted");
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("switch"));
    expect(status()).toBe("denied");
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });
});
