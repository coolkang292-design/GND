import { describe, expect, it } from "vitest";
import { getStageGrowthGoal } from "./evolution-gate";

describe("진화 성장 목표", () => {
  it.each([1, 2])("현재%d단계는 시동러까지 XP만으로 진화", current => {
    expect(getStageGrowthGoal(current, null)).toMatchObject({ mode: "xp_only" });
  });
  it("시동러→꾸준러 진입부터 M18의15%=3종목·평균5%", () => {
    expect(getStageGrowthGoal(3, 18)).toMatchObject({ mode: "growth_preview", nextStage: 4,
      requiredCount: 3, averageTargetPct: 5 });
  });
  it("꾸준러→불꽃러는4종목·평균8%", () => {
    expect(getStageGrowthGoal(4, 18)).toMatchObject({ requiredCount: 4, averageTargetPct: 8 });
  });
  it("M이 없으면 최소1개로 임의 통과시키지 않고 기준 준비 상태", () => {
    expect(getStageGrowthGoal(3, null)).toMatchObject({ mode: "needs_baseline" });
  });
  it("최종 단계에는 다음 성장 관문을 만들지 않는다", () => {
    expect(getStageGrowthGoal(7, 18)).toEqual({ mode: "complete", nextStage: null });
  });
});
