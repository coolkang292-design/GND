// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  WorkoutCompleteStamp,
  stampRotation,
} from "./workout-complete-stamp";

describe("WorkoutCompleteStamp", () => {
  it("회전각은 날짜가 같으면 항상 같다", () => {
    expect(stampRotation("2026-10-07")).toBe(stampRotation("2026-10-07"));
  });

  it("날짜가 다르면 회전각이 다양하다 — 전부 같은 각이면 도장 느낌이 죽는다", () => {
    const set = new Set(
      Array.from({ length: 28 }, (_, i) =>
        stampRotation(`2026-10-${String(i + 1).padStart(2, "0")}`),
      ),
    );
    expect(set.size).toBeGreaterThanOrEqual(4);
  });

  it("보조기기에는 숨기고(셀 aria-label이 상태를 말한다) 라임 토큰 색을 쓴다", () => {
    const { container } = render(<WorkoutCompleteStamp seed="2026-10-07" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("class")).toContain("text-accent");
  });
});
