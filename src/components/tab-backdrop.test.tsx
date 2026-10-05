// @vitest-environment jsdom

import { existsSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/image", () => ({
  default: (props: {
    src: string;
    alt: string;
    loading?: "eager" | "lazy";
    fetchPriority?: "high" | "low" | "auto";
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src}
      alt={props.alt}
      loading={props.loading}
      fetchPriority={props.fetchPriority}
    />
  ),
}));

import { TabBackdrop } from "./tab-backdrop";

afterEach(cleanup);

describe("TabBackdrop — 탭 첫 화면 배경 사진 (2026-10-05)", () => {
  const TABS = ["/home", "/feed", "/record", "/challenge", "/profile"];

  it.each(TABS)("%s 첫 화면에는 배경 사진을 깐다 (파일이 있다)", (path) => {
    nav.pathname = path;
    render(<TabBackdrop />);
    const src = screen.getByTestId("tab-backdrop").getAttribute("data-src")!;
    expect(existsSync(join(__dirname, "..", "..", "public", src))).toBe(true);
  });

  it("다섯 화면은 서로 다른 사진이다", () => {
    const srcs = TABS.map((path) => {
      nav.pathname = path;
      const { unmount } = render(<TabBackdrop />);
      const src = screen.getByTestId("tab-backdrop").getAttribute("data-src");
      unmount();
      return src;
    });
    expect(new Set(srcs).size).toBe(5);
  });

  it.each(["/challenge/abc", "/record/programs", "/profile/settings", "/login"])(
    "%s 같은 다른·하위 화면에는 깔지 않는다",
    (path) => {
      nav.pathname = path;
      render(<TabBackdrop />);
      expect(screen.queryByTestId("tab-backdrop")).toBeNull();
    },
  );

  it("작게 만든 전용 사진을 지연 로딩 없이 쓴다 — 탭을 옮기면 사진이 늦게 떴다", () => {
    nav.pathname = "/feed";
    const { container } = render(<TabBackdrop />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/tab-backdrops/feed.webp");
    expect(img.getAttribute("loading")).toBe("eager");
    // 장식 사진이 피드 데이터보다 먼저 받아지면 안 된다 (2026-10-05 두 번째 신고)
    expect(img.getAttribute("fetchpriority")).not.toBe("high");
  });

  it("나머지 네 장은 앱을 연 직후가 아니라 잠시 뒤, 낮은 우선순위로 한 장씩 받는다", () => {
    vi.useFakeTimers();
    const requested: { src: string; priority: string }[] = [];
    // jsdom의 Image는 팩토리라 하위 클래스가 안 먹는다 — 원형의 src 쓰기를 엿보고,
    // 받기를 흉내 내 onload를 부른다(한 장이 끝나야 다음 장을 받는지 본다)
    const setSrc = vi
      .spyOn(HTMLImageElement.prototype, "src", "set")
      .mockImplementation(function (this: HTMLImageElement, value: string) {
        if (!value.startsWith("/tab-backdrops/") || this.isConnected) return;
        requested.push({ src: value, priority: String(this.fetchPriority) });
        setTimeout(() => this.onload?.(new Event("load")), 100);
      });
    try {
      nav.pathname = "/feed";
      render(<TabBackdrop />);
      act(() => vi.advanceTimersByTime(2000));
      expect(requested).toHaveLength(0); // 첫 화면·첫 이동이 먼저다
      act(() => vi.advanceTimersByTime(550)); // 2.5초에 첫 장, 그 장이 끝나기(+100ms) 전
      expect(requested).toHaveLength(1); // 한꺼번에가 아니라 한 장
      act(() => vi.runAllTimers());
      expect(requested.map((r) => r.src)).toEqual([
        "/tab-backdrops/home.webp",
        "/tab-backdrops/record.webp",
        "/tab-backdrops/challenge.webp",
        "/tab-backdrops/profile.webp",
      ]);
      expect(requested.every((r) => r.priority === "low")).toBe(true);
    } finally {
      setSrc.mockRestore();
      vi.useRealTimers();
    }
  });
});
