// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkoutStampReveal } from "./workout-stamp-reveal";
import { STAMP_HEADLINE_DELAY_MS, STAMP_SPECIAL_LINE_DELAY_MS } from "@/lib/domain/workout-stamps";
import { STAMP_REVEAL_DURATION_MS } from "@/lib/domain/session-flow";

afterEach(cleanup);

describe("saved workout stamp impact", () => {
  it("shows a large stamped orange award without a gold burst", () => {
    const { container } = render(<WorkoutStampReveal dateKey="2026-10-21" variant="orange" />);
    expect(screen.getByTestId("large-stamp-impact")).toBeTruthy();
    const headline = screen.getByTestId("stamp-achievement-line");
    const subline = screen.getByTestId("stamp-special-line");
    expect(headline.textContent).toBe("오늘도 해냈다.");
    expect(subline.textContent).toBe("오늘은 느낌이 좀 좋은데?");
    expect(headline.style.animationDelay).toBe(`${STAMP_HEADLINE_DELAY_MS}ms`);
    expect(subline.style.animationDelay).toBe(`${STAMP_SPECIAL_LINE_DELAY_MS}ms`);
    expect(container.querySelector(".gnd-stamp-gold-burst")).toBeNull();
  });
  it("reserves the glint for gold", () => {
    const { container } = render(<WorkoutStampReveal dateKey="2026-10-21" variant="gold" />);
    expect(screen.getByText("오늘도 해냈다.")).toBeTruthy();
    expect(screen.getByText("오늘, 뭔가 좋은 일 생기려나?")).toBeTruthy();
    expect(container.querySelectorAll(".gnd-stamp-gold-burst")).toHaveLength(1);
  });
  it("celebrates effort without a jackpot message for normal stamps", () => {
    render(<WorkoutStampReveal dateKey="2026-10-21" variant="basic" />);
    expect(screen.getByText("오늘도 해냈다.")).toBeTruthy();
    expect(screen.queryByTestId("stamp-special-line")).toBeNull();
  });
  it("leaves an intentional beat after the impact and enough reading time before navigation", () => {
    expect(STAMP_HEADLINE_DELAY_MS).toBeGreaterThan(1050);
    expect(STAMP_SPECIAL_LINE_DELAY_MS).toBeGreaterThan(STAMP_HEADLINE_DELAY_MS + 460);
    expect(STAMP_REVEAL_DURATION_MS).toBeGreaterThan(STAMP_SPECIAL_LINE_DELAY_MS + 1200);
  });
});
