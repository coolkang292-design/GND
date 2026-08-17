// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { launchSplashGate } from "@/lib/domain/launch-splash";
import { LaunchMotivationSplash } from "./launch-motivation-splash";

vi.mock("next/image", () => ({
  default: (
    props: ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      priority?: boolean;
    },
  ) => {
    const { fill, priority, ...imageProps } = props;
    void fill;
    void priority;
    return <img {...imageProps} />;
  },
}));

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

function settleSessionDecision() {
  act(() => vi.advanceTimersByTime(0));
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  vi.spyOn(launchSplashGate, "claim").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("LaunchMotivationSplash", () => {
  it("새 실행이면 승인 배경과 오타 없는 실제 브랜드 문구를 준비한다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();

    const splash = screen.getByRole("button", {
      name: "시작 화면 건너뛰기",
    });
    expect(splash).toBeTruthy();
    expect(splash.getAttribute("aria-describedby")).toBe(
      "launch-splash-description",
    );
    const image = screen.getByTestId("launch-splash-image");
    expect(image.getAttribute("src")).toBe(
      "/splash/gnd-launch-motivation-v3.png",
    );
    expect(image.getAttribute("sizes")).toBe(
      "(max-width: 430px) 100vw, 430px",
    );
    expect(image.className).toContain("object-contain");
    expect(image.className).not.toContain("object-cover");
    fireEvent.load(image);

    expect(screen.getByText("지금은 같은 출발선.")).toBeTruthy();
    expect(
      screen.getByText("1년 뒤, 프로와 아마추어가 갈린다."),
    ).toBeTruthy();
    expect(screen.queryByText(/갈은 출발선/)).toBeNull();
    expect(screen.getByTestId("launch-splash-copy").className).not.toContain(
      "sr-only",
    );
  });

  it("이미 본 실행 세션이면 덮개를 즉시 없앤다", () => {
    vi.mocked(launchSplashGate.claim).mockReturnValue(false);
    render(<LaunchMotivationSplash />);
    settleSessionDecision();

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("이미지가 준비된 뒤 1.5초를 채우고 180ms 페이드 후 사라진다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();
    fireEvent.load(screen.getByTestId("launch-splash-image"));

    act(() => vi.advanceTimersByTime(1_499));
    expect(
      screen.getByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(
      screen.getByRole("button", { name: "시작 화면 건너뛰기" }).className,
    ).toContain("opacity-0");

    act(() => vi.advanceTimersByTime(180));
    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("사용자가 터치하면 기다리지 않고 사라진다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();
    fireEvent.load(screen.getByTestId("launch-splash-image"));

    fireEvent.click(
      screen.getByRole("button", { name: "시작 화면 건너뛰기" }),
    );
    act(() => vi.advanceTimersByTime(180));

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("이미지 실패 시 검은 GND 대체 화면을 보여주고 자동 종료한다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();
    fireEvent.error(screen.getByTestId("launch-splash-image"));

    expect(screen.getByText("GND")).toBeTruthy();
    expect(screen.getByText("지금은 같은 출발선.")).toBeTruthy();
    expect(
      screen.getByText("1년 뒤, 프로와 아마추어가 갈린다."),
    ).toBeTruthy();
    expect(screen.getByTestId("launch-splash-copy").className).toContain(
      "opacity-100",
    );
    act(() => vi.advanceTimersByTime(1_680));

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("이미지 상태가 오지 않아도 3초 뒤 앱 진입을 풀어준다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();

    act(() => vi.advanceTimersByTime(3_000));

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("reduced motion에서는 터치 즉시 페이드 없이 사라진다", () => {
    mockReducedMotion(true);
    render(<LaunchMotivationSplash />);
    settleSessionDecision();
    fireEvent.load(screen.getByTestId("launch-splash-image"));

    fireEvent.click(
      screen.getByRole("button", { name: "시작 화면 건너뛰기" }),
    );

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });
});
