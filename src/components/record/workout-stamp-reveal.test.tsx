// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkoutStampReveal } from "./workout-stamp-reveal";

describe("saved workout stamp impact", () => {
  it("shows a large stamped orange award without a gold burst", () => {
    const { container } = render(<WorkoutStampReveal dateKey="2026-10-21" variant="orange" />);
    expect(screen.getByTestId("large-stamp-impact")).toBeTruthy();
    expect(screen.getByText("오늘은 느낌이 좀 좋은데?")).toBeTruthy();
    expect(container.querySelector(".gnd-stamp-gold-burst")).toBeNull();
  });
  it("reserves the glint for gold", () => {
    const { container } = render(<WorkoutStampReveal dateKey="2026-10-21" variant="gold" />);
    expect(screen.getByText("오늘, 뭔가 좋은 일 생기려나?")).toBeTruthy();
    expect(container.querySelectorAll(".gnd-stamp-gold-burst")).toHaveLength(1);
  });
  it("celebrates effort without a jackpot message for normal stamps", () => {
    render(<WorkoutStampReveal dateKey="2026-10-21" variant="basic" />);
    expect(screen.getByText("오늘도 해냈다.")).toBeTruthy();
  });
});
