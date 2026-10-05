// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TabsLayout from "./layout";

vi.mock("@/components/launch-motivation-splash", () => ({
  LaunchMotivationSplash: () => <div data-testid="launch-splash" />,
}));
vi.mock("@/components/onboarding-gate", () => ({
  OnboardingGate: () => <div data-testid="onboarding-gate" />,
}));
vi.mock("@/components/cheer-banner", () => ({
  CheerBanner: () => <div data-testid="cheer-banner" />,
}));
vi.mock("@/components/tab-bar", () => ({
  TabBar: () => <div data-testid="tab-bar" />,
}));

afterEach(cleanup);

describe("TabsLayout", () => {
  it("탭 셸은 공통 루트의 시작 화면을 중복 마운트하지 않는다", () => {
    render(
      <TabsLayout>
        <div>현재 화면</div>
      </TabsLayout>,
    );

    expect(screen.queryByTestId("launch-splash")).toBeNull();
    expect(screen.getByText("현재 화면")).toBeTruthy();
    expect(screen.getByTestId("onboarding-gate")).toBeTruthy();
    expect(screen.getByTestId("cheer-banner")).toBeTruthy();
    expect(screen.getByTestId("tab-bar")).toBeTruthy();
  });
});
