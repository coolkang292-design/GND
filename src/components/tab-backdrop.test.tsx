// @vitest-environment jsdom

import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
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
});
