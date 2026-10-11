// @vitest-environment jsdom
/**
 * `FunnelTracker` — 첫 화면에서 **나중에** 동의해도 `landing_opened`가 PostHog에 남는가 (v2, 2026-10-11).
 *
 * DB 기록(`analytics_events`)은 `recordFunnelEvent` 안의 세션 표시·unique가 중복을 막으므로
 * 여기서는 "동의 순간 한 번 더 시도하는가"만 본다. PostHog 쪽 1회 보장은 `reconcile.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { installMemoryStorage } from "@/lib/posthog/test-storage";

const h = vi.hoisted(() => ({ record: vi.fn(async () => true) }));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => ({ userId: "anon-1" }) }));
vi.mock("@/lib/analytics-events", () => ({ recordFunnelEvent: h.record }));

import { FunnelTracker } from "./funnel-tracker";
import { grantAnalyticsConsent, declineOrWithdrawAnalyticsConsent } from "@/lib/posthog/consent-actions";

beforeEach(() => {
  installMemoryStorage();
  h.record.mockClear();
});
afterEach(() => cleanup());

describe("FunnelTracker", () => {
  it("화면이 뜰 때 한 번, 그 화면에서 동의하면 한 번 더 시도한다", () => {
    render(<FunnelTracker />);
    expect(h.record).toHaveBeenCalledTimes(1);
    act(() => {
      grantAnalyticsConsent();
    });
    expect(h.record).toHaveBeenCalledTimes(2);
    expect(h.record.mock.calls.every((c) => (c as unknown[])[0] === "landing_opened")).toBe(true);
  });

  it("동의 상태가 그대로면 다시 그려져도 더 시도하지 않는다", () => {
    const { rerender } = render(<FunnelTracker />);
    rerender(<FunnelTracker />);
    rerender(<FunnelTracker />);
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it("거부로 바뀌어도 한 번 시도하지만(PostHog는 동의가 없어 버린다) 앱은 그대로다", () => {
    render(<FunnelTracker />);
    act(() => {
      declineOrWithdrawAnalyticsConsent();
    });
    expect(h.record).toHaveBeenCalledTimes(2);
  });
});
