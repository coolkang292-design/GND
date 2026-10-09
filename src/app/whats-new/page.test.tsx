// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WhatsNewPage from "./page";

afterEach(cleanup);

describe("새 소식 화면 — 아이폰 상태표시줄", () => {
  /**
   * 탭 묶음 밖 화면이라 `(tabs)/layout.tsx`의 상태표시줄 여백을 못 받는다
   * (2026-10-08 아이폰 설치 앱 "상단 버튼이 안 눌린다"). 머리가 직접 더해야 한다.
   */
  it("머리 위쪽 여백이 상태표시줄을 피하고 닫기 버튼은 누르는 영역을 넓힌다", () => {
    render(<WhatsNewPage />);

    const close = screen.getByRole("link", { name: "닫기" });
    const header = close.closest("header")!;
    expect(header.style.paddingTop).toContain("env(safe-area-inset-top)");
    expect(header.className).not.toMatch(/\bpy-3\b/);
    expect(close.className).toContain("tap-44");
  });
});
