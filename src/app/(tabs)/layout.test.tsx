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
  it("일반 앱 셸에 실행 스플래시를 정확히 한 번 마운트한다", () => {
    render(
      <TabsLayout>
        <div>현재 화면</div>
      </TabsLayout>,
    );

    expect(screen.getAllByTestId("launch-splash")).toHaveLength(1);
    expect(screen.getByText("현재 화면")).toBeTruthy();
    expect(screen.getByTestId("onboarding-gate")).toBeTruthy();
    expect(screen.getByTestId("cheer-banner")).toBeTruthy();
    expect(screen.getByTestId("tab-bar")).toBeTruthy();
  });
});
