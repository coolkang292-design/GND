// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CrewPage from "./page";

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ userId: null, loading: true, configured: true }),
}));
vi.mock("@/lib/crew-link", () => ({
  acceptCrewRequest: vi.fn(),
  getIncomingCrewRequests: vi.fn(async () => []),
  getMyCrew: vi.fn(async () => []),
  rejectCrewRequest: vi.fn(),
  removeCrew: vi.fn(),
  searchProfileByNickname: vi.fn(),
  sendCrewRequest: vi.fn(),
}));

afterEach(cleanup);

describe("CrewPage", () => {
  /**
   * `/crew`는 탭 묶음 밖이라 `(tabs)/layout.tsx`의 상태표시줄 여백을 못 받는다
   * (2026-10-08 아이폰 설치 앱). 헤더가 직접 `safe-area-inset-top`을 더해야 한다.
   */
  it("헤더 위쪽 여백이 상태표시줄을 피한다 (env(safe-area-inset-top))", () => {
    render(<CrewPage />);

    const header = screen.getByRole("heading", { name: "크루" }).closest("header")!;
    expect(header.style.paddingTop).toContain("env(safe-area-inset-top)");
    expect(screen.getByRole("link", { name: "닫기" }).className).toContain("tap-44");
    expect(header.className).not.toContain("pt-3");
  });
});
