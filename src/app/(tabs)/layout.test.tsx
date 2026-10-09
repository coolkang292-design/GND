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
vi.mock("@/components/tab-backdrop", () => ({
  TabBackdrop: () => <div data-testid="tab-backdrop" />,
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

  /**
   * 아이폰 설치 앱 상태표시줄 여백 (2026-10-08). `main`에 넣으면 사진(`-top-4`)이
   * 같이 내려가 맨 위에 사진 없는 띠가 생기고, `main`에 층을 주면 운동 고르기 시트가
   * 잘린다(2026-10-05). 그래서 여백은 사진의 부모 상자 **안쪽**에만 있어야 한다.
   */
  it("상태표시줄 여백은 main이 아니라 사진의 부모 상자 안쪽에 둔다", () => {
    const { container } = render(
      <TabsLayout>
        <div>현재 화면</div>
      </TabsLayout>,
    );

    const main = container.querySelector("main")!;
    expect(main.className).toContain("pt-4");
    expect(main.style.paddingTop).toBe("");
    expect(main.className).not.toMatch(/\b(relative|isolate|z-\d+)\b/);

    const box = screen.getByTestId("tab-backdrop").parentElement!;
    expect(box.parentElement).toBe(main);
    expect(box.className).toContain("pt-[env(safe-area-inset-top)]");
  });
});
