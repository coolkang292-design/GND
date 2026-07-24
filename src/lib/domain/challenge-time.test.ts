import { describe, expect, it } from "vitest";
import { challengeDaysLeft } from "./challenge-time";

describe("challengeDaysLeft — 오늘~종료일 남은 일수(오늘 포함)", () => {
  it("종료 당일이면 1", () => {
    expect(challengeDaysLeft("2026-08-28", "2026-08-28")).toBe(1);
  });
  it("종료 하루 전이면 2", () => {
    expect(challengeDaysLeft("2026-08-27", "2026-08-28")).toBe(2);
  });
  it("종료일이 지났으면 0", () => {
    expect(challengeDaysLeft("2026-08-29", "2026-08-28")).toBe(0);
  });
  it("월 경계를 넘어도 정확히 계산", () => {
    expect(challengeDaysLeft("2026-07-30", "2026-08-02")).toBe(4);
  });
});
