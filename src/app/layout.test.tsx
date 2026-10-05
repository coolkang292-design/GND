// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "./layout";

vi.mock("@/components/auth-provider", () => ({ AuthProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/service-worker-register", () => ({ ServiceWorkerRegister: () => null }));
vi.mock("@/components/acquisition-tracker", () => ({ AcquisitionTracker: () => null }));
vi.mock("@/components/funnel-tracker", () => ({ FunnelTracker: () => null }));
vi.mock("@/components/trail-tracker", () => ({ TrailTracker: () => null }));
vi.mock("@/components/install/install-gate", () => ({ InstallGate: () => null }));
vi.mock("@/components/launch-motivation-splash", () => ({ LaunchMotivationSplash: () => <div data-testid="launch-splash" /> }));
vi.mock("@/lib/site-url", () => ({ siteUrl: () => "https://example.com" }));

describe("RootLayout launch splash", () => {
  it("탭 밖 로그인 화면에도 시작 화면을 한 번 연결한다", () => {
    const html = renderToStaticMarkup(<RootLayout><main>로그인 화면</main></RootLayout>);
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll('[data-testid="launch-splash"]')).toHaveLength(1);
    expect(document.body.textContent).toContain("로그인 화면");
  });
});
