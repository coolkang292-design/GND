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
      unoptimized?: boolean;
    },
  ) => {
    const { fill, priority, unoptimized, alt = "", ...imageProps } = props;
    void fill;
    void priority;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Next Image 테스트 대역
      <img
        alt={alt}
        data-unoptimized={String(unoptimized)}
        {...imageProps}
      />
    );
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
  /**
   * 2026-10-06 사용자 지시 "B로 고치기" — 글자 박힌 통짜 이미지 대신 **글자 없는 사진 +
   * 실제 글자**. 사용자 교정본(`더 나은 나를`)이 화면에 있어야 하고 옛 문구(`당신을`)는 없어야 한다.
   */
  it("새 실행이면 글자 없는 사진을 꽉 채우고, 확정 문구를 실제 글자로 그린다", () => {
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
    expect(image.getAttribute("src")).toBe("/gnd/photos/onboarding-sweat-860.webp");
    // 기본 <img>다 — next/image로는 캐시된 사진의 onLoad가 오지 않았다(2026-10-06 실측)
    expect(image.tagName).toBe("IMG");
    expect(image.getAttribute("fetchpriority")).toBe("high");
    // 위아래 검은 띠가 생기지 않게 꽉 채운다
    expect(image.className).toContain("object-cover");
    expect(image.className).not.toContain("object-contain");
    // 사진이 오기 전에는 글자도 없다(빈 화면 위 글자만 번쩍이지 않게)
    expect(screen.queryByTestId("launch-splash-copy")).toBeNull();
    fireEvent.load(image);

    const description = screen.getByTestId("launch-splash-description");
    expect(description.className).toContain("sr-only");
    expect(description.textContent).toBe(
      "의지가 꺾인 날에도 계속한 사람이 결국 이긴다",
    );
    const copy = screen.getByTestId("launch-splash-copy");
    expect(copy.textContent).toContain("결국 이긴다");
    expect(copy.textContent).toContain("친구들과의 기록이 더 나은 나를 만든다.");
    expect(copy.textContent).not.toContain("당신을");
    expect(screen.getByAltText("GND")).toBeTruthy();
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

    // 사진이 없어도 같은 글자 화면(검은 바탕)이 뜬다
    expect(screen.getByAltText("GND")).toBeTruthy();
    expect(screen.getByText("의지가 꺾인 날에도")).toBeTruthy();
    expect(screen.getByText("결국 이긴다")).toBeTruthy();
    expect(screen.queryByText("매일 1도의 방향이,")).toBeNull();
    act(() => vi.advanceTimersByTime(1_680));

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("이미지 상태가 오지 않아도 2초 뒤 앱 진입을 풀어준다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();

    act(() => vi.advanceTimersByTime(2_000));

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("늦게 로드된 이미지도 실행 후 2초를 넘겨 앱을 가리지 않는다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();
    act(() => vi.advanceTimersByTime(1_200));
    fireEvent.load(screen.getByTestId("launch-splash-image"));
    act(() => vi.advanceTimersByTime(800));
    expect(screen.queryByRole("button", { name: "시작 화면 건너뛰기" })).toBeNull();
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
