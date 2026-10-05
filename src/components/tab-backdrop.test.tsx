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
  getImageProps: ({ src }: { src: string }) => ({
    props: { src: `/_next/image?url=${encodeURIComponent(src)}&w=1200&q=75`, srcSet: `${src} 1200w`, sizes: "100vw" },
  }),
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

  it("화면 맨 위 사진이라 지연 로딩하지 않는다 — 탭을 옮기면 사진이 늦게 떴다", () => {
    nav.pathname = "/feed";
    const { container } = render(<TabBackdrop />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  it("나머지 네 탭 사진을 한가할 때 한 번만 미리 받는다", () => {
    vi.useFakeTimers();
    // jsdom의 Image는 팩토리라 하위 클래스가 안 먹는다 — 원형의 src 쓰기를 엿본다
    const setSrc = vi.spyOn(HTMLImageElement.prototype, "src", "set");
    try {
      // requestIdleCallback이 없는 환경(jsdom)은 setTimeout으로 간다
      nav.pathname = "/feed";
      const first = render(<TabBackdrop />);
      act(() => vi.runAllTimers());
      first.unmount();
      nav.pathname = "/home";
      render(<TabBackdrop />);
      act(() => vi.runAllTimers());
      const warmed = setSrc.mock.calls
        .map(([value]) => String(value))
        .filter((value) => value.startsWith("/_next/image"));
      expect(warmed).toHaveLength(4);
      expect(warmed.some((u) => u.includes("shoulder"))).toBe(false); // 지금 화면 것은 빼고
    } finally {
      setSrc.mockRestore();
      vi.useRealTimers();
    }
  });
});
