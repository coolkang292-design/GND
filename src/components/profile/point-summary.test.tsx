import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PointSummary } from "./point-summary";

describe("PointSummary", () => {
  it("잔액·배수·불꽃을 3칸으로 보여준다", () => {
    const html = renderToStaticMarkup(
      <PointSummary balance={12840} streakDays={27} />,
    );
    expect(html).toContain("12,840");
    expect(html).toContain("×4");
    expect(html).toContain("27일");
    expect(html).toContain("GND 포인트");
  });

  it("불꽃 구간별 배수를 맞게 계산한다 — SQL point_multiplier와 같아야 한다", () => {
    const cases: [number, string][] = [
      [0, "×1"],
      [4, "×1"],
      [5, "×1.5"],
      [9, "×1.5"],
      [10, "×2"],
      [14, "×2"],
      [15, "×3"],
      [24, "×3"],
      [25, "×4"],
      [100, "×4"],
    ];
    for (const [streak, label] of cases) {
      const html = renderToStaticMarkup(
        <PointSummary balance={0} streakDays={streak} />,
      );
      expect(html, `불꽃 ${streak}일`).toContain(`⚡${label}`);
    }
  });

  it("다음 배수까지 남은 일수를 안내한다", () => {
    expect(
      renderToStaticMarkup(<PointSummary balance={0} streakDays={0} />),
    ).toContain("5일 더");
    expect(
      renderToStaticMarkup(<PointSummary balance={0} streakDays={12} />),
    ).toContain("3일 더");
  });

  it("최고 배수에 도달하면 안내를 감춘다", () => {
    const html = renderToStaticMarkup(
      <PointSummary balance={0} streakDays={30} />,
    );
    expect(html).not.toContain("일 더");
  });
});
