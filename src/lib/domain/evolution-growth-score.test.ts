import { describe, expect, it } from "vitest";
import { computeEvolutionGrowthScore, type GrowthRecord, type StageGrowth } from "./level-growth";

const record = (exerciseKey: string, growthPct: number, kind: GrowthRecord["kind"] = "w"): GrowthRecord => ({
  exerciseKey, growthPct, kind,
  baseline: 100, baselineDay: "2026-10-01", baselineBest: { weight: 75, reps: 10, seconds: null },
  current: 100 + growthPct, currentDay: "2026-11-01", currentBest: { weight: 80, reps: 10, seconds: null },
});
const summary = (values: number[]): StageGrowth => ({
  growths: values.map((pct, i) => record(`운동${i}`, pct)),
  unchangedCount: 9, comparableCount: values.length + 9,
  unmatched: [{ exerciseKey: "기구 변경", kind: "w", reason: "jump" }],
  previousStageExerciseCount: 18,
});

describe("진화 평가 — 상위 N종목, 고정 N분모", () => {
  it("+10/+8/+6과 N=3이면 평균8%, 성장3/3", () => {
    expect(computeEvolutionGrowthScore(summary([10, 8, 6]), 3)).toMatchObject({
      averagePct: 8, requiredCount: 3, filledCount: 3, countMet: true,
    });
  });
  it("같은 기록과 N=4이면 빈자리0%를 포함해 평균6%, 성장3/4", () => {
    expect(computeEvolutionGrowthScore(summary([10, 8, 6]), 4)).toMatchObject({
      averagePct: 6, filledCount: 3, countMet: false,
    });
  });
  it("+20/+10/+1/+1은 개별8%를 요구하지 않고 평균8%, 성장4/4", () => {
    expect(computeEvolutionGrowthScore(summary([20, 10, 1, 1]), 4)).toMatchObject({
      averagePct: 8, filledCount: 4, countMet: true,
    });
  });
  it("평균8%여도 세 종목이면 최소4종목을 채우지 못한다", () => {
    expect(computeEvolutionGrowthScore(summary([20, 10, 2]), 4)).toMatchObject({ averagePct: 8, countMet: false });
  });
  it("입력 순서와 무관하게 높은 N개만 쓰고 원본은 정렬하지 않는다", () => {
    const s = summary([2, 20, 8, 10, 1]);
    const before = structuredClone(s);
    const result = computeEvolutionGrowthScore(s, 3);
    expect(result.selected.map(g => g.growthPct)).toEqual([20, 10, 8]);
    expect(result.averagePct).toBeCloseTo(38 / 3, 10);
    expect(s).toEqual(before);
  });
  it("변함없음·비교제외가 많아도 분모는 N이며 성장0개면0/N", () => {
    expect(computeEvolutionGrowthScore(summary([]), 4)).toMatchObject({ averagePct: 0, filledCount: 0, countMet: false });
  });
  it("한 종목의 다른 지표를 두 종목으로 세지 않는다", () => {
    const s = summary([]);
    s.growths = [record("풀업", 10, "r"), record("풀업", 20, "w")];
    expect(computeEvolutionGrowthScore(s, 2)).toMatchObject({ averagePct: 10, filledCount: 1, countMet: false });
  });
  it.each([0, -1, 1.5, NaN, Infinity])("잘못된 필요 개수 %s로 0나누기·자동통과를 만들지 않는다", n => {
    expect(() => computeEvolutionGrowthScore(summary([10]), n)).toThrow(RangeError);
  });
});
